import { expect, test } from '@janux/testing/playwright';

/**
 * The fixtures, exercised by the real Playwright runner (spawned from
 * e2e/playwright-fixtures.e2e.test.ts): one server per worker for the built
 * shop, `goto` that lands settled, and `settled()` after an interaction.
 */

test.use({ janux: { root: process.env.JANUX_SHOP_ROOT! } });

test('a zero-JS page is quiet by construction', async ({ goto, page }) => {
  await goto('/');

  await expect(page.locator('h1')).toHaveText('Janux Shop');
});

test('an island page lands settled and settles again after an interaction', async ({ goto, page, settled }) => {
  await goto('/shop');
  await page.locator('.product button').first().click();
  await settled();

  await expect(page.locator('button.x').first()).toBeVisible();
});
