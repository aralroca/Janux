import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { googleCssUrl, parseGoogleCss, selectFaces } from './google-fonts';

const CSS = readFileSync(join(import.meta.dir, '__fixtures__/fonts/inter.css'), 'utf8');

describe('the Google Fonts request', () => {
  it('asks for the declared weights and styles in the order the API expects', () => {
    const url = googleCssUrl({ family: 'Inter', weights: [600, 400], styles: ['italic', 'normal'] });

    expect(url).toContain('family=Inter:ital,wght@0,400;0,600;1,400;1,600');
    expect(url).toContain('display=swap');
  });

  it('drops the italic axis entirely when only normal is asked for', () => {
    expect(googleCssUrl({ family: 'Inter', weights: [400] })).toContain('family=Inter:wght@400');
  });

  it('spells a multi-word family the way the API takes it', () => {
    expect(googleCssUrl({ family: 'Fira Sans' })).toContain('family=Fira+Sans:wght@400');
  });
});

describe('parsing what Google answers', () => {
  const faces = parseGoogleCss(CSS);

  it('reads one face per subset per weight, with the range that selects it', () => {
    const latin = faces.filter((face) => face.subset === 'latin');

    expect(latin.map((face) => face.weight).sort()).toEqual([400, 600]);
    expect(latin[0]!.unicodeRange).toContain('U+0000-00FF');
    expect(latin[0]!.url.startsWith('https://fonts.gstatic.com/')).toBe(true);
  });

  it('keeps the styles apart', () => {
    expect(faces.every((face) => face.style === 'normal')).toBe(true);
  });
});

/**
 * Subsetting is the difference between shipping latin and shipping every script
 * Google has: the API returns them all, and declaring `subsets` is what throws
 * the rest away before anything is downloaded.
 */
describe('selecting the faces an app actually wants', () => {
  it('keeps only the declared subsets', () => {
    const selected = selectFaces(parseGoogleCss(CSS), { family: 'Inter', subsets: ['latin'] });

    expect([...new Set(selected.map((face) => face.subset))]).toEqual(['latin']);
  });

  it('marks exactly one file critical: primary subset, lightest upright weight', () => {
    const selected = selectFaces(parseGoogleCss(CSS), {
      family: 'Inter',
      weights: [400, 600],
      subsets: ['latin', 'greek'],
    });
    const critical = selected.filter((face) => face.preload);

    expect(critical).toHaveLength(1);
    expect(critical[0]).toMatchObject({ subset: 'latin', weight: 400, style: 'normal' });
  });

  /** The request already asks for the declared weights; trusting the answer to match is how a page ships a weight nobody uses. */
  it('keeps only the declared weights and styles, whatever the response carries', () => {
    const selected = selectFaces(parseGoogleCss(CSS), { family: 'Inter', weights: [600], subsets: ['latin'] });

    expect(selected.map((face) => face.weight)).toEqual([600]);
    expect(selectFaces(parseGoogleCss(CSS), { family: 'Inter', styles: ['italic'] })).toEqual([]);
  });

  it('preloads nothing when the app opts out', () => {
    const selected = selectFaces(parseGoogleCss(CSS), { family: 'Inter', subsets: ['latin'], preload: false });

    expect(selected.some((face) => face.preload)).toBe(false);
  });
});
