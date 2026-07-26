import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

/**
 * Contrast is arithmetic, so it does not need a browser — and it should not be
 * left to one. The Lighthouse gate audits three pages in one colour scheme;
 * this checks every text token against every surface it lands on, in both
 * schemes, straight from the stylesheet.
 *
 * It exists because two of these pairs shipped broken: `--muted` was 3.23:1 on
 * white, and 4.16:1 on the dark soft surface — the second one no audited page
 * happened to exercise. `--accent` is in here for the same reason: it is link
 * text, and it lands on the soft surfaces too (blockquotes, table headers, the
 * active sidebar item, the search result under the cursor).
 */

const CSS = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
const AA_NORMAL = 4.5;

/** `--name: light-dark(#aaa, #bbb)` → the pair, in scheme order. */
function token(name: string): [string, string] {
  const declared = new RegExp(`--${name}:\\s*light-dark\\(\\s*(#[0-9a-f]{3,8})\\s*,\\s*(#[0-9a-f]{3,8})\\s*\\)`, 'i').exec(CSS);

  if (!declared) throw new Error(`--${name} is not a light-dark() token in styles.css`);

  return [declared[1]!.toLowerCase(), declared[2]!.toLowerCase()];
}

function channel(value: number): number {
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const [r, g, b] = [0, 2, 4].map((offset) => channel(parseInt(hex.slice(offset + 1, offset + 3), 16) / 255));

  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);

  return (lighter! + 0.05) / (darker! + 0.05);
}

const SURFACES = ['bg', 'bg-soft', 'accent-soft'] as const;
const TEXT_TOKENS = ['text', 'heading', 'muted', 'accent'] as const;
/** Position is the index: `token()` returns each pair in scheme order. */
const SCHEMES = ['light', 'dark'] as const;

describe('palette contrast (WCAG AA, normal text)', () => {
  for (const [index, name] of SCHEMES.entries()) {
    for (const text of TEXT_TOKENS) {
      for (const surface of SURFACES) {
        test(`${name}: --${text} on --${surface}`, () => {
          const ratio = contrast(token(text)[index], token(surface)[index]);

          expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL);
        });
      }
    }
  }
});

/**
 * Shiki's GitHub themes ship two token colours that don't clear AA as
 * body-sized code text; markdown.ts replaces them. These assert the
 * replacements are still the right side of the line — against the code block's
 * own background and against the page's.
 */
describe('syntax highlighting contrast', () => {
  const CASES = [
    { name: 'light keyword orange', color: '#bd4b00', backgrounds: ['#ffffff'] },
    { name: 'dark comment grey', color: '#8b949e', backgrounds: ['#24292e', '#212121'] },
  ];

  for (const { name, color, backgrounds } of CASES) {
    test(name, () => {
      backgrounds.forEach((background) => expect(contrast(color, background)).toBeGreaterThanOrEqual(AA_NORMAL));
    });
  }
});
