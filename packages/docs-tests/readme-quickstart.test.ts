import { describe, expect, it } from 'bun:test';
import { createInstance, jsx, renderToString } from 'janux';
import { docExample } from './doc-example';

/**
 * The README quick-start runs for real: the Cart snippet is extracted from
 * README.md, evaluated (with its one app-local import stubbed) and exercised
 * through SSR + the intent pipeline. If the front-door example rots, this fails.
 */

const PAY_STUB = { "import { pay } from './pay.api';": 'const pay = async () => ({ ok: true });' };

describe('README quick-start (Cart)', () => {
  it('SSRs the documented component and drives its intents through the pipeline', async () => {
    const { Cart } = await docExample('README.md', 0, PAY_STUB);
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
