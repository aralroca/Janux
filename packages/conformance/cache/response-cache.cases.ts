import { createResponseCache, revalidatePath, revalidateTag, NONCE_HEADER } from '@janux/server';
import { type ScenarioCase } from '../support/scenario';

/**
 * The shared HTTP response cache: what may be stored, how freshness and the
 * stale-while-revalidate window behave, how the key is built, and — the part
 * clocks get wrong — invalidation ordered by a monotonic counter, so a purge
 * and a store on the same millisecond still have a defined winner, in both
 * directions.
 *
 * `revalidateTag`/`revalidatePath` are module-level by design, so every case
 * uses its own URL and tag names.
 */

interface Clock {
  now: () => number;
  tick: (ms: number) => void;
}

function clock(start = 100_000): Clock {
  let now = start;

  return {
    now: () => now,
    tick: (ms) => {
      now += ms;
    },
  };
}

/** An origin that counts its calls and stamps each body with the call number. */
function origin(headers: Record<string, string>, status = 200) {
  let calls = 0;

  return {
    produce: async () => ((calls += 1), new Response(`body-${calls}`, { status, headers })),
    calls: () => calls,
  };
}

const get = (url: string, headers: Record<string, string> = {}): Request => new Request(url, { headers });
const state = (res: Response): string => String(res.headers.get('x-janux-cache'));

export const RESPONSE_CACHE_CASES: ScenarioCase[] = [
  // ── the basic hit path ──────────────────────────────────────────────────────
  {
    id: 'cache-http-a-public-response-is-served-from-the-cache-on-the-second-request',
    src: 'janux',
    run: async (log) => {
      const cache = createResponseCache({ now: clock().now });
      const source = origin({ 'cache-control': 'public, max-age=60' });
      const first = await cache.handle(get('http://cx/hit'), source.produce);

      log.push(`first:${state(first)}:${await first.text()}`);
      await cache.idle();
      const second = await cache.handle(get('http://cx/hit'), source.produce);

      log.push(`second:${state(second)}:${await second.text()}`, `calls:${source.calls()}`);
    },
    expected: ['first:MISS:body-1', 'second:HIT:body-1', 'calls:1'],
  },
  {
    id: 'cache-http-a-hit-replays-status-and-headers-not-just-the-body',
    src: 'janux',
    run: async (log) => {
      const cache = createResponseCache({ now: clock().now });
      const source = origin({ 'cache-control': 'public, max-age=60', 'content-type': 'text/html', 'x-custom': 'kept' });

      await (await cache.handle(get('http://cx/headers'), source.produce)).text();
      await cache.idle();
      const hit = await cache.handle(get('http://cx/headers'), source.produce);

      log.push(`status:${hit.status}`, `type:${hit.headers.get('content-type')}`, `custom:${hit.headers.get('x-custom')}`);
    },
    expected: ['status:200', 'type:text/html', 'custom:kept'],
  },
  {
    id: 'cache-http-the-commit-lands-only-after-the-body-finished-streaming',
    src: 'janux',
    run: async (log) => {
      const cache = createResponseCache({ now: clock().now });
      const source = origin({ 'cache-control': 'public, max-age=60' });

      await (await cache.handle(get('http://cx/commit'), source.produce)).text();
      // No idle(): the same-tick second request races the commit; after idle it must hit.
      await cache.idle();
      log.push(`after-idle:${state(await cache.handle(get('http://cx/commit'), source.produce))}`);
    },
    expected: ['after-idle:HIT'],
  },
  {
    id: 'cache-http-a-render-that-dies-mid-stream-is-never-committed',
    src: 'janux',
    run: async (log) => {
      const cache = createResponseCache({ now: clock().now });
      let calls = 0;
      const produce = async () => {
        calls += 1;

        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('partial'));
              controller.error(new Error('render-died'));
            },
          }),
          { status: 200, headers: { 'cache-control': 'public, max-age=60' } },
        );
      };
      const first = await cache.handle(get('http://cx/dies'), produce);

      await first.text().catch(() => log.push('client-saw-the-error'));
      await cache.idle();
      const second = await cache.handle(get('http://cx/dies'), produce);

      log.push(`second:${state(second)}`, `calls:${calls}`);
      await second.text().catch(() => undefined);
      await cache.idle();
    },
    expected: ['client-saw-the-error', 'second:MISS', 'calls:2'],
  },

  // ── what is never stored ────────────────────────────────────────────────────
  {
    id: 'cache-http-post-requests-bypass-the-cache-entirely',
    src: 'janux',
    run: async (log) => {
      const cache = createResponseCache({ now: clock().now });
      const source = origin({ 'cache-control': 'public, max-age=60' });

      await (await cache.handle(get('http://cx/post'), source.produce)).text();
      await cache.idle();
      const post = await cache.handle(new Request('http://cx/post', { method: 'POST' }), source.produce);

      log.push(`post:${state(post)}`, `calls:${source.calls()}`);
    },
    expected: ['post:null', 'calls:2'],
  },
  {
    id: 'cache-http-private-responses-are-never-kept',
    src: 'janux',
    run: async (log) => {
      const cache = createResponseCache({ now: clock().now });
      const source = origin({ 'cache-control': 'private, max-age=60' });

      await (await cache.handle(get('http://cx/private'), source.produce)).text();
      await cache.idle();
      const second = await cache.handle(get('http://cx/private'), source.produce);

      log.push(`second:${state(second)}`, `calls:${source.calls()}`);
    },
    expected: ['second:null', 'calls:2'],
  },
  {
    id: 'cache-http-no-store-wins-over-public',
    src: 'janux',
    run: async (log) => {
      const cache = createResponseCache({ now: clock().now });
      const source = origin({ 'cache-control': 'public, no-store, max-age=60' });

      await (await cache.handle(get('http://cx/nostore'), source.produce)).text();
      await cache.idle();
      log.push(`second:${state(await cache.handle(get('http://cx/nostore'), source.produce))}`, `calls:${source.calls()}`);
    },
    expected: ['second:null', 'calls:2'],
  },
  {
    id: 'cache-http-a-response-with-no-cache-control-is-not-yours-to-keep',
    src: 'janux',
    run: async (log) => {
      const cache = createResponseCache({ now: clock().now });
      const source = origin({});

      await (await cache.handle(get('http://cx/silent'), source.produce)).text();
      await cache.idle();
      log.push(`second:${state(await cache.handle(get('http://cx/silent'), source.produce))}`, `calls:${source.calls()}`);
    },
    expected: ['second:null', 'calls:2'],
  },
  {
    id: 'cache-http-public-with-max-age-zero-is-not-stored',
    src: 'janux',
    run: async (log) => {
      const cache = createResponseCache({ now: clock().now });
      const source = origin({ 'cache-control': 'public, max-age=0' });

      await (await cache.handle(get('http://cx/zero'), source.produce)).text();
      await cache.idle();
      log.push(`second:${state(await cache.handle(get('http://cx/zero'), source.produce))}`, `calls:${source.calls()}`);
    },
    expected: ['second:null', 'calls:2'],
  },
  {
    id: 'cache-http-non-200-responses-are-not-stored',
    src: 'janux',
    run: async (log) => {
      const cache = createResponseCache({ now: clock().now });
      const source = origin({ 'cache-control': 'public, max-age=60' }, 404);

      await (await cache.handle(get('http://cx/missing'), source.produce)).text();
      await cache.idle();
      log.push(`second:${state(await cache.handle(get('http://cx/missing'), source.produce))}`, `calls:${source.calls()}`);
    },
    expected: ['second:null', 'calls:2'],
  },
  {
    id: 'cache-http-set-cookie-disqualifies-a-response-from-the-shared-cache',
    src: 'janux',
    run: async (log) => {
      const cache = createResponseCache({ now: clock().now });
      const source = origin({ 'cache-control': 'public, max-age=60', 'set-cookie': 'session=abc' });

      await (await cache.handle(get('http://cx/cookie'), source.produce)).text();
      await cache.idle();
      log.push(`second:${state(await cache.handle(get('http://cx/cookie'), source.produce))}`, `calls:${source.calls()}`);
    },
    expected: ['second:null', 'calls:2'],
  },
  {
    id: 'cache-http-vary-star-means-there-is-no-key-to-build',
    src: 'janux',
    run: async (log) => {
      const cache = createResponseCache({ now: clock().now });
      const source = origin({ 'cache-control': 'public, max-age=60', vary: '*' });

      await (await cache.handle(get('http://cx/varystar'), source.produce)).text();
      await cache.idle();
      log.push(`second:${state(await cache.handle(get('http://cx/varystar'), source.produce))}`, `calls:${source.calls()}`);
    },
    expected: ['second:null', 'calls:2'],
  },
  {
    id: 'cache-http-a-nonced-page-is-never-shared-cached',
    src: 'janux',
    run: async (log) => {
      const cache = createResponseCache({ now: clock().now });
      const source = origin({ 'cache-control': 'public, max-age=60', [NONCE_HEADER]: 'abc123' });

      await (await cache.handle(get('http://cx/nonced'), source.produce)).text();
      await cache.idle();
      log.push(`second:${state(await cache.handle(get('http://cx/nonced'), source.produce))}`, `calls:${source.calls()}`);
    },
    expected: ['second:null', 'calls:2'],
  },
  {
    id: 'cache-http-a-body-past-max-bytes-is-passed-through-not-stored',
    src: 'janux',
    run: async (log) => {
      const cache = createResponseCache({ now: clock().now, maxBytes: 4 });
      const source = origin({ 'cache-control': 'public, max-age=60' });
      const first = await cache.handle(get('http://cx/huge'), source.produce);

      log.push(`first:${await first.text()}`);
      await cache.idle();
      log.push(`second:${state(await cache.handle(get('http://cx/huge'), source.produce))}`, `calls:${source.calls()}`);
      await cache.idle();
    },
    expected: ['first:body-1', 'second:MISS', 'calls:2'],
  },

  // ── freshness windows ───────────────────────────────────────────────────────
  {
    id: 'cache-http-fresh-strictly-before-max-age-stale-exactly-at-it',
    src: 'janux',
    run: async (log) => {
      const time = clock();
      const cache = createResponseCache({ now: time.now });
      const source = origin({ 'cache-control': 'public, max-age=10' });

      await (await cache.handle(get('http://cx/edge'), source.produce)).text();
      await cache.idle();
      time.tick(9_999);
      log.push(`before:${state(await cache.handle(get('http://cx/edge'), source.produce))}`);
      time.tick(1);
      const at = await cache.handle(get('http://cx/edge'), source.produce);

      log.push(`at:${state(at)}:${await at.text()}`);
      await cache.idle();
    },
    expected: ['before:HIT', 'at:MISS:body-2'],
  },
  {
    id: 'cache-http-s-maxage-outranks-max-age-for-the-shared-copy',
    src: 'janux',
    run: async (log) => {
      const time = clock();
      const cache = createResponseCache({ now: time.now });
      const source = origin({ 'cache-control': 'public, max-age=0, s-maxage=10' });

      await (await cache.handle(get('http://cx/smaxage'), source.produce)).text();
      await cache.idle();
      time.tick(5_000);
      log.push(`within:${state(await cache.handle(get('http://cx/smaxage'), source.produce))}`, `calls:${source.calls()}`);
    },
    expected: ['within:HIT', 'calls:1'],
  },
  {
    id: 'cache-http-stale-within-swr-serves-the-old-body-and-refreshes-once',
    src: 'janux',
    run: async (log) => {
      const time = clock();
      const cache = createResponseCache({ now: time.now });
      const source = origin({ 'cache-control': 'public, max-age=1, stale-while-revalidate=60' });

      await (await cache.handle(get('http://cx/swr'), source.produce)).text();
      await cache.idle();
      time.tick(5_000);
      const stale = await cache.handle(get('http://cx/swr'), source.produce);

      log.push(`stale:${state(stale)}:${await stale.text()}`);
      await cache.idle();
      const refreshed = await cache.handle(get('http://cx/swr'), source.produce);

      log.push(`refreshed:${state(refreshed)}:${await refreshed.text()}`, `calls:${source.calls()}`);
    },
    expected: ['stale:STALE:body-1', 'refreshed:HIT:body-2', 'calls:2'],
  },
  {
    id: 'cache-http-a-burst-of-stale-hits-costs-one-origin-call',
    src: 'janux',
    run: async (log) => {
      const time = clock();
      const cache = createResponseCache({ now: time.now });
      const source = origin({ 'cache-control': 'public, max-age=1, stale-while-revalidate=60' });

      await (await cache.handle(get('http://cx/burst'), source.produce)).text();
      await cache.idle();
      time.tick(5_000);
      const [first, second] = await Promise.all([
        cache.handle(get('http://cx/burst'), source.produce),
        cache.handle(get('http://cx/burst'), source.produce),
      ]);

      log.push(`states:${state(first)},${state(second)}`);
      await cache.idle();
      log.push(`calls:${source.calls()}`);
    },
    expected: ['states:STALE,STALE', 'calls:2'],
  },
  {
    id: 'cache-http-past-the-swr-window-the-client-waits-for-origin',
    src: 'janux',
    run: async (log) => {
      const time = clock();
      const cache = createResponseCache({ now: time.now });
      const source = origin({ 'cache-control': 'public, max-age=1, stale-while-revalidate=2' });

      await (await cache.handle(get('http://cx/expired'), source.produce)).text();
      await cache.idle();
      time.tick(3_000);
      const past = await cache.handle(get('http://cx/expired'), source.produce);

      log.push(`past:${state(past)}:${await past.text()}`);
      await cache.idle();
    },
    expected: ['past:MISS:body-2'],
  },

  // ── the key: query string and vary ──────────────────────────────────────────
  {
    id: 'cache-http-the-query-string-is-part-of-the-key',
    src: 'janux',
    run: async (log) => {
      const cache = createResponseCache({ now: clock().now });
      const source = origin({ 'cache-control': 'public, max-age=60' });

      await (await cache.handle(get('http://cx/qs?page=1'), source.produce)).text();
      await cache.idle();
      log.push(`same:${state(await cache.handle(get('http://cx/qs?page=1'), source.produce))}`);
      const other = await cache.handle(get('http://cx/qs?page=2'), source.produce);

      log.push(`other:${state(other)}`);
      await other.text();
      await cache.idle();
    },
    expected: ['same:HIT', 'other:MISS'],
  },
  {
    id: 'cache-http-vary-splits-the-cache-by-the-named-request-header',
    src: 'janux',
    run: async (log) => {
      const cache = createResponseCache({ now: clock().now });
      const source = origin({ 'cache-control': 'public, max-age=60', vary: 'accept-language' });

      await (await cache.handle(get('http://cx/vary', { 'accept-language': 'en' }), source.produce)).text();
      await cache.idle();
      log.push(`en:${state(await cache.handle(get('http://cx/vary', { 'accept-language': 'en' }), source.produce))}`);
      const es = await cache.handle(get('http://cx/vary', { 'accept-language': 'es' }), source.produce);

      log.push(`es:${state(es)}`, `calls:${source.calls()}`);
      await es.text();
      await cache.idle();
    },
    expected: ['en:HIT', 'es:MISS', 'calls:2'],
  },

  // ── invalidation by monotonic counter, not by the clock ─────────────────────
  {
    id: 'cache-http-revalidate-tag-purges-the-entries-carrying-it',
    src: 'janux',
    run: async (log) => {
      const cache = createResponseCache({ now: clock().now });
      const tagged = origin({ 'cache-control': 'public, max-age=60', 'cache-tag': 'cx-catalog' });
      const plain = origin({ 'cache-control': 'public, max-age=60' });

      await (await cache.handle(get('http://cx/tagged'), tagged.produce)).text();
      await (await cache.handle(get('http://cx/plain'), plain.produce)).text();
      await cache.idle();
      revalidateTag('cx-catalog');
      const purged = await cache.handle(get('http://cx/tagged'), tagged.produce);

      log.push(`tagged:${state(purged)}:${await purged.text()}`);
      log.push(`plain:${state(await cache.handle(get('http://cx/plain'), plain.produce))}`);
      await cache.idle();
    },
    expected: ['tagged:MISS:body-2', 'plain:HIT'],
  },
  {
    id: 'cache-http-any-one-of-several-tags-purges-the-entry',
    src: 'janux',
    run: async (log) => {
      const cache = createResponseCache({ now: clock().now });
      const source = origin({ 'cache-control': 'public, max-age=60', 'cache-tag': 'cx-multi-a, cx-multi-b' });

      await (await cache.handle(get('http://cx/multitag'), source.produce)).text();
      await cache.idle();
      revalidateTag('cx-multi-b');
      const purged = await cache.handle(get('http://cx/multitag'), source.produce);

      log.push(`purged:${state(purged)}`);
      await purged.text();
      await cache.idle();
    },
    expected: ['purged:MISS'],
  },
  {
    id: 'cache-http-a-space-separated-surrogate-key-header-is-parsed-into-tags',
    src: 'janux',
    run: async (log) => {
      const cache = createResponseCache({ now: clock().now, tagHeader: 'surrogate-key' });
      const source = origin({ 'cache-control': 'public, max-age=60', 'surrogate-key': 'cx-sk-one cx-sk-two' });

      await (await cache.handle(get('http://cx/surrogate'), source.produce)).text();
      await cache.idle();
      revalidateTag('cx-sk-two');
      const purged = await cache.handle(get('http://cx/surrogate'), source.produce);

      log.push(`purged:${state(purged)}`);
      await purged.text();
      await cache.idle();
    },
    expected: ['purged:MISS'],
  },
  {
    id: 'cache-http-revalidate-path-purges-every-query-string-variant-of-the-path',
    src: 'janux',
    run: async (log) => {
      const cache = createResponseCache({ now: clock().now });
      const source = origin({ 'cache-control': 'public, max-age=60' });

      await (await cache.handle(get('http://cx/listing?page=1'), source.produce)).text();
      await cache.idle();
      await (await cache.handle(get('http://cx/listing?page=2'), source.produce)).text();
      await cache.idle();
      revalidatePath('/listing');
      const one = await cache.handle(get('http://cx/listing?page=1'), source.produce);
      const two = await cache.handle(get('http://cx/listing?page=2'), source.produce);

      log.push(`one:${state(one)}`, `two:${state(two)}`);
      await Promise.all([one.text(), two.text()]);
      await cache.idle();
    },
    expected: ['one:MISS', 'two:MISS'],
  },
  {
    id: 'cache-http-revalidate-path-leaves-other-paths-alone',
    src: 'janux',
    run: async (log) => {
      const cache = createResponseCache({ now: clock().now });
      const source = origin({ 'cache-control': 'public, max-age=60' });

      await (await cache.handle(get('http://cx/kept'), source.produce)).text();
      await cache.idle();
      revalidatePath('/somewhere-else');
      log.push(`kept:${state(await cache.handle(get('http://cx/kept'), source.produce))}`);
    },
    expected: ['kept:HIT'],
  },
  {
    id: 'cache-http-a-purge-on-the-same-millisecond-as-the-store-still-purges',
    src: 'janux',
    run: async (log) => {
      const frozen = () => 999_999;
      const cache = createResponseCache({ now: frozen });
      const source = origin({ 'cache-control': 'public, max-age=60', 'cache-tag': 'cx-tie-purge' });

      await (await cache.handle(get('http://cx/tie-purge'), source.produce)).text();
      await cache.idle();
      revalidateTag('cx-tie-purge');
      const purged = await cache.handle(get('http://cx/tie-purge'), source.produce);

      log.push(`purged:${state(purged)}`);
      await purged.text();
      await cache.idle();
    },
    expected: ['purged:MISS'],
  },
  {
    id: 'cache-http-an-entry-stored-after-a-same-millisecond-purge-survives-it',
    src: 'janux',
    run: async (log) => {
      const frozen = () => 999_999;
      const cache = createResponseCache({ now: frozen });
      const source = origin({ 'cache-control': 'public, max-age=60', 'cache-tag': 'cx-tie-store' });

      revalidateTag('cx-tie-store');
      await (await cache.handle(get('http://cx/tie-store'), source.produce)).text();
      await cache.idle();
      log.push(`stored:${state(await cache.handle(get('http://cx/tie-store'), source.produce))}`, `calls:${source.calls()}`);
    },
    expected: ['stored:HIT', 'calls:1'],
  },
  {
    id: 'cache-http-a-purge-issued-while-the-render-ran-outranks-the-entry-it-produced',
    src: 'janux',
    run: async (log) => {
      const cache = createResponseCache({ now: clock().now });
      let calls = 0;
      const produce = async () => {
        calls += 1;
        if (calls === 1) revalidateTag('cx-midrender');

        return new Response(`body-${calls}`, {
          status: 200,
          headers: { 'cache-control': 'public, max-age=60', 'cache-tag': 'cx-midrender' },
        });
      };

      await (await cache.handle(get('http://cx/midrender'), produce)).text();
      await cache.idle();
      const second = await cache.handle(get('http://cx/midrender'), produce);

      log.push(`second:${state(second)}:${await second.text()}`);
      await cache.idle();
    },
    expected: ['second:MISS:body-2'],
  },

  // ── bounded memory ──────────────────────────────────────────────────────────
  {
    id: 'cache-http-eviction-drops-the-least-recently-read-entry',
    src: 'janux',
    run: async (log) => {
      const cache = createResponseCache({ now: clock().now, maxEntries: 2 });
      const headers = { 'cache-control': 'public, max-age=60' };
      const a = origin(headers);
      const b = origin(headers);
      const c = origin(headers);

      await (await cache.handle(get('http://cx/lru-a'), a.produce)).text();
      await cache.idle();
      await (await cache.handle(get('http://cx/lru-b'), b.produce)).text();
      await cache.idle();
      // Reading `a` re-inserts it, so `b` is now the oldest and gets evicted by `c`.
      await (await cache.handle(get('http://cx/lru-a'), a.produce)).text();
      const stored = await cache.handle(get('http://cx/lru-c'), c.produce);

      await stored.text();
      await cache.idle();
      log.push(`a:${state(await cache.handle(get('http://cx/lru-a'), a.produce))}`);
      const evicted = await cache.handle(get('http://cx/lru-b'), b.produce);

      log.push(`b:${state(evicted)}`, `c:${state(await cache.handle(get('http://cx/lru-c'), c.produce))}`);
      await evicted.text();
      await cache.idle();
    },
    expected: ['a:HIT', 'b:MISS', 'c:HIT'],
  },
  {
    id: 'cache-http-overflowing-the-invalidation-index-over-purges-never-under-purges',
    src: 'janux',
    run: async (log) => {
      const cache = createResponseCache({ now: clock().now });
      const source = origin({ 'cache-control': 'public, max-age=60' });

      await (await cache.handle(get('http://cx/epoch'), source.produce)).text();
      await cache.idle();
      // Blow past the bounded index: it clears and bumps the epoch instead of
      // forgetting, so the pre-overflow entry reads as invalidated (slow request)
      // rather than pinned fresh forever (stale data served forever).
      for (let index = 0; index < 10_001; index += 1) revalidateTag(`cx-flood-${index}`);
      const after = await cache.handle(get('http://cx/epoch'), source.produce);

      log.push(`after-overflow:${state(after)}`, `calls:${source.calls()}`);
      await after.text();
      await cache.idle();
    },
    expected: ['after-overflow:MISS', 'calls:2'],
  },
];
