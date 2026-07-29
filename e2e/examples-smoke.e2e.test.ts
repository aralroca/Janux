import { describe, expect, it } from 'bun:test';
import { readdirSync } from 'node:fs';
import { appRoot, ssrApp } from './support/app';

/**
 * Every directory under examples/ must at least boot, serve its home page and
 * expose the agent manifest — an example that cannot start is not an example.
 * The list is discovered, not declared: adding a broken folder fails CI.
 */

const EXAMPLES = readdirSync(appRoot('examples'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

for (const name of EXAMPLES) {
  describe(`examples/${name} smoke`, () => {
    it('boots, serves the home page and the agent manifest', async () => {
      const { get } = await ssrApp(`examples/${name}`);
      let home = await get('/');

      // Locale-routed apps answer the bare root with a redirect — follow it.
      if (home.status >= 300 && home.status < 400) home = await get(home.headers.get('location')!);
      expect(home.status).toBe(200);
      expect(await home.text()).toContain('<html');
      expect((await get('/_janux/manifest')).status).toBe(200);
    }, 30_000);
  });
}
