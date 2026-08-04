/**
 * An in-memory `CacheStorage`, enough of one to drive the strategy tests.
 *
 * `Cache.addAll` fetches through the *global* fetch rather than the service
 * worker's own handler, so the fake takes its fetch from the constructor: a
 * precache that quietly resolved from the very cache it is filling would prove
 * nothing about install.
 */

const ORIGIN = 'https://app.test';

function keyOf(request: RequestInfo): string {
  return new URL(typeof request === 'string' ? request : request.url, ORIGIN).href;
}

export class FakeCache {
  readonly entries = new Map<string, Response>();

  constructor(private readonly fetch: (request: Request) => Promise<Response>) {}

  async match(request: RequestInfo): Promise<Response | undefined> {
    return this.entries.get(keyOf(request))?.clone();
  }

  async put(request: RequestInfo, response: Response): Promise<void> {
    this.entries.set(keyOf(request), response);
  }

  async add(url: string): Promise<void> {
    await this.addAll([url]);
  }

  async addAll(urls: string[]): Promise<void> {
    const responses = await Promise.all(urls.map((url) => this.fetch(new Request(keyOf(url)))));

    if (responses.some((response) => !response.ok)) throw new TypeError('addAll: request failed');
    urls.forEach((url, index) => this.entries.set(keyOf(url), responses[index]!));
  }
}

export class FakeCacheStorage {
  readonly caches = new Map<string, FakeCache>();

  constructor(private readonly fetch: (request: Request) => Promise<Response> = async () => new Response('')) {}

  async open(name: string): Promise<FakeCache> {
    const existing = this.caches.get(name) ?? new FakeCache(this.fetch);

    this.caches.set(name, existing);

    return existing;
  }

  async keys(): Promise<string[]> {
    return [...this.caches.keys()];
  }

  async delete(name: string): Promise<boolean> {
    return this.caches.delete(name);
  }
}

/** `new Request()` at the fake's origin, so pathname lookups line up. */
export function request(path: string, init?: RequestInit & { mode?: RequestMode }): Request {
  return new Request(new URL(path, ORIGIN).href, init);
}

export { ORIGIN };
