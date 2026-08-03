import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The social card is a committed asset, so nothing regenerates it on the way to
 * production — which means nothing would notice it going stale, wrong-sized or
 * missing either. These are the two claims the card makes: that it is the size
 * every platform crops to, and that the mark on it is the logo rather than a
 * drawing that drifted from it.
 */

const ROOT = join(import.meta.dirname, '..');
const CARD = join(ROOT, 'apps/docs/public/og.png');

/** Width and height live in the PNG's IHDR, the first chunk after the signature. */
function pngSize(file: string): { width: number; height: number } {
  const bytes = readFileSync(file);

  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** The geometry of an SVG, ignoring the box it is drawn in: paths, circles and rects. */
function shapes(svg: string): string[] {
  return [...svg.matchAll(/\s(?:d|cx|x)="[^"]*"[^>]*/g)]
    .map(([shape]) => shape.replace(/\s+/g, ' ').trim())
    .filter((shape) => !shape.startsWith('d="M0'));
}

describe('the docs social card', () => {
  it('is the 1200×630 every platform crops to', () => {
    expect(pngSize(CARD)).toEqual({ width: 1200, height: 630 });
  });

  /**
   * The generator inlines the mark instead of linking it — the card renders from
   * a data URL, which has no origin to resolve `/logo.svg` against. One drawing
   * in two files is a drift waiting to happen, so this is where it is caught.
   */
  it('draws the same mark as the logo it is made from', () => {
    const logo = readFileSync(join(ROOT, 'apps/docs/public/logo.svg'), 'utf8');
    const generator = readFileSync(join(ROOT, 'scripts/og-image.ts'), 'utf8');

    expect(shapes(generator)).toEqual(shapes(logo));
  });
});
