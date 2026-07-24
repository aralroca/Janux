import { describe, expect, it } from 'bun:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInstance, jsx, renderToString } from 'janux';

/**
 * The README quick-start runs for real: the Cart snippet is extracted from
 * README.md, evaluated (with its one app-local import stubbed) and exercised
 * through SSR + the intent pipeline. If the front-door example rots, this fails.
 */

const ROOT = resolve(import.meta.dir, '../..');

function extractCartSnippet(): string {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  const [block] = [...readme.matchAll(/```tsx\n([\s\S]*?)```/g)];

  return block![1]!;
}

async function loadCart(): Promise<any> {
  const code = extractCartSnippet().replace("import { pay } from './pay.api';", 'const pay = async () => ({ ok: true });');
  const file = join(import.meta.dir, '.readme-cart.generated.tsx');

  writeFileSync(file, code);

  return (await import(file)).Cart;
}

describe('README quick-start (Cart)', () => {
  it('SSRs the documented component and drives its intents through the pipeline', async () => {
    const Cart = await loadCart();
    const { html } = await renderToString(jsx(Cart, {}), {});

    expect(html).toContain('Pay (0¢)');
    const instance = createInstance(Cart, { onProposal: () => {} });
    await instance.attach();
    await instance.intents.addItem({ productId: 'sku-1', qty: 2, unitPrice: 250 });

    expect(instance.bag.derived.total).toBe(500);
    const result: any = await instance.intents.checkout(undefined, { origin: 'agent' });

    expect(result?.status).toBe('proposal');
  });
});
