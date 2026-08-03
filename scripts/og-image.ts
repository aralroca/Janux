/**
 * The docs site's social card, drawn from the logo rather than photographed.
 *
 * A shared link is often the only Janux anyone sees that day, so the card says
 * the three things worth saying — the mark, the name, and what it is — at the
 * 1200×630 every platform crops to. It is rendered by the browser the e2e suite
 * already installs, so the only dependency is one the repo has.
 *
 * The output is committed: a card that regenerates on every build would be a
 * build-time browser launch for an asset that changes once a year.
 *
 *   bun scripts/og-image.ts            # → apps/docs/public/og.png
 *   bun scripts/og-image.ts --out x.png
 */
import { chromium } from 'playwright';

const WIDTH = 1200;
const HEIGHT = 630;
const OUT = flag('--out') ?? 'apps/docs/public/og.png';

function flag(name: string): string | undefined {
  const index = Bun.argv.indexOf(name);

  return index > 0 ? Bun.argv[index + 1] : undefined;
}

/**
 * The logo, inlined rather than linked: the page is rendered from a data URL, so
 * a `<img src="/logo.svg">` would have nothing to resolve against. Same paths as
 * `apps/docs/public/logo.svg` — the mark is one drawing in two places, and
 * `og-image.test.ts` fails if they drift.
 */
const MARK = `
<svg width="150" height="150" viewBox="0 0 240 240" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="16" y="16" width="208" height="208" rx="48" fill="#000000"/>
  <rect x="112" y="58" width="16" height="124" rx="8" fill="#ffffff"/>
  <path d="M112 70 C 74 76, 58 100, 58 120 C 58 140, 74 164, 112 170"
        stroke="#ffffff" stroke-width="12" stroke-linecap="round" fill="none"/>
  <circle cx="84" cy="112" r="9" fill="#ffffff"/>
  <path d="M128 70 L 168 84 L 182 120 L 168 156 L 128 170"
        stroke="#ffffff" stroke-width="12" stroke-linejoin="round" stroke-linecap="round" fill="none"/>
  <rect x="148" y="104" width="17" height="17" rx="3" fill="#ffffff"/>
</svg>`;

/**
 * Deliberately not the site's own palette token-for-token: a card is composited
 * on someone else's timeline, in their scheme, so it commits to one look. The
 * accent is the dark-scheme blue (#47a8ff) because this card is always dark —
 * the light-scheme #0062ff would not clear contrast on near-black.
 */
const CARD = `
<style>
  * { margin: 0; box-sizing: border-box; }
  body {
    width: ${WIDTH}px; height: ${HEIGHT}px; display: flex; flex-direction: column;
    justify-content: space-between; padding: 76px 84px; background: #0b0b0b;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, sans-serif;
    color: #ffffff; overflow: hidden; position: relative;
  }
  /* One soft light source behind the mark, so the tile does not sit on a flat void. */
  body::before {
    content: ''; position: absolute; top: -220px; left: -160px; width: 760px; height: 760px;
    background: radial-gradient(circle, rgba(71,168,255,.18) 0%, rgba(71,168,255,0) 68%);
  }
  header, main, footer { position: relative; }
  header { display: flex; align-items: center; gap: 30px; }
  .wordmark { font-size: 76px; font-weight: 800; letter-spacing: -2.5px; }
  /* Two lines across the full card: a headline, not a paragraph squeezed into a column. */
  .tagline { font-size: 62px; font-weight: 700; line-height: 1.14; letter-spacing: -2px; max-width: 940px; }
  .tagline em { font-style: normal; color: #47a8ff; }
  footer { display: flex; align-items: center; gap: 18px; font-size: 25px; color: #9a9a9a; }
  .rule { width: 46px; height: 3px; background: #47a8ff; border-radius: 2px; }
  strong { color: #ededed; font-weight: 600; }
</style>
<header>${MARK}<span class="wordmark">Janux</span></header>
<main><p class="tagline">The fullstack framework for the <em>Agentic Web</em></p></main>
<footer><span class="rule"></span><strong>One component, two faces</strong> · janux.build</footer>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });

await page.setContent(CARD);
await page.screenshot({ path: OUT, type: 'png' });
await browser.close();

console.log(`✔ wrote ${OUT} — ${WIDTH}×${HEIGHT}`);
