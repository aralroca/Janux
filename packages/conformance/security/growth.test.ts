import { createFsRouter } from '@janux/server';
import { piiFilter, runProcessors, unicodeNormalizer } from '@janux/agent';
import { describe, expect } from 'bun:test';
import { int, list, obj, schema, str, translateCore, validate } from 'janux';
import { hashKey } from 'janux/query';
import { dirname, join } from 'node:path';
import { renderAttrs } from '../../janux/src/render/html';
import { runCases } from '../support/scenario';
import { GROWTH_CASES, type GrowthRow } from './growth.cases';

/**
 * 4× the input. Linear work grows ~4×, quadratic ~16×. The ceiling sits between
 * them, so timing noise cannot trip it and a complexity regression cannot hide.
 *
 * The sample is 20k rather than 8k because the ceiling is only meaningful while
 * the measurement is: at 8k the PII scrub's small run took ~0.6ms, barely over
 * the floor below, and a single scheduling hiccup on a shared CI runner was
 * enough to push the ratio past 8 on work that is provably linear. At 20k the
 * same run takes ~1.8ms, and the two sites this actually asserts (pii-scrub /
 * separators and escape-attribute / escapable) measure ~3.7× and ~3.9× — half
 * the ceiling. The whole matrix still costs well under a tenth of a second.
 */
const SMALL = 20_000;
const FACTOR = 4;
const MAX_GROWTH = 8;
/** Below this, the small run is too fast to measure and the ratio is pure noise. */
const MEASURABLE_MS = 0.4;
const RUNS = 5;

const router = createFsRouter(join(dirname(import.meta.path), '../router-nav/__fixtures__/routes'));

function input(shape: GrowthRow['shape'], chars: number): string {
  if (shape === 'separators') return 'a.'.repeat(chars / 2);
  if (shape === 'escapable') return '<"&'.repeat(chars / 3);
  if (shape === 'digits') return '1'.repeat(chars);

  return 'a'.repeat(chars);
}

const translate = translateCore('en', {
  locales: ['en'],
  defaultLocale: 'en',
  messages: { en: { k: 'x {{n}} y' } },
} as never) as unknown as (key: string, query?: unknown) => unknown;

async function exercise(site: GrowthRow['site'], text: string): Promise<void> {
  const message = { messages: [{ role: 'user', content: text } as never] };

  if (site === 'pii-scrub') await runProcessors([piiFilter()], message);
  else if (site === 'unicode-normalize') await runProcessors([unicodeNormalizer()], message);
  else if (site === 'i18n-interpolation') translate('k', { n: text });
  else if (site === 'escape-attribute') renderAttrs({ title: text, href: text });
  else if (site === 'route-match') router.match(`/blog/${text}`);
  else if (site === 'schema-validate') validate(schema({ xs: list(str()), o: obj({ n: int() }) }), { xs: [text], o: { n: 1 } });
  else hashKey([text]);
}

/**
 * Fastest of five, not the median: interference only ever ADDS time, so the
 * quickest run is the closest estimate of what the algorithm actually costs.
 * It also discards the cold first pass for free. This loses no detection power
 * — quadratic work is quadratic in its best run too — while making a noisy
 * neighbour on the runner unable to decide the verdict.
 */
async function fastest(site: GrowthRow['site'], text: string): Promise<number> {
  const runs: number[] = [];

  for (let attempt = 0; attempt < RUNS; attempt += 1) {
    const started = performance.now();

    await exercise(site, text);
    runs.push(performance.now() - started);
  }

  return Math.min(...runs);
}

describe('complexity growth', () =>
  runCases(GROWTH_CASES, async (row) => {
    const small = await fastest(row.site, input(row.shape, SMALL));
    const large = await fastest(row.site, input(row.shape, SMALL * FACTOR));

    // Too fast to time reliably: the work is trivially linear, nothing to assert.
    if (small < MEASURABLE_MS) return;
    expect(large / small).toBeLessThan(MAX_GROWTH);
  }));
