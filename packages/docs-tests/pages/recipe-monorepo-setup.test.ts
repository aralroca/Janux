import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { component, enums, intent, jsx, renderToString, schema } from 'janux';
import { boot } from 'janux/client';
import { collectApis, invokeApi } from '@janux/server';
import { parseArgs } from '@janux/cli';
import { docExample } from '../doc-example';
import { serveIntoDom } from './__fixtures__/serve';

/**
 * recipes/monorepo-setup.md, executed. The claim that matters is the one a
 * reader will otherwise learn the hard way: a shared island that isn't in
 * boot({ defs }) renders and then stays dead. Both halves run here.
 */

const BILLING_STUB = {
  "import { chargeCustomer } from '@acme/billing';":
    "const chargeCustomer = async (id: string) => `charged:${id}`;",
};

/** The shared island the page describes (packages/ui/src/Toggle.tsx). */
const Toggle = component({
  name: 'toggle',
  description: 'A shared on/off switch',
  state: schema({ status: enums(['on', 'off']).default('off') }),
  intents: {
    flip: intent({
      description: 'Flip the switch',
      run: ({ state }: any) => (state.status = state.status === 'on' ? 'off' : 'on'),
    }),
  },
  view: ({ state, intents }: any) => jsx('button', { class: 'toggle', on: intents.flip, children: state.status }),
});


beforeAll(() => GlobalRegistrator.register({ url: 'http://localhost:3000/' }));
afterAll(() => GlobalRegistrator.unregister());

describe('recipes/monorepo-setup.md — a shared island needs registering', () => {
  it('wakes up when the app boots with it in defs', async () => {
    await serveIntoDom(jsx(Toggle as any, {}));
    boot({ defs: [Toggle], webmcp: false });
    (document.querySelector('.toggle') as HTMLElement).click();
    await Bun.sleep(20);

    expect(document.querySelector('.toggle')!.textContent).toBe('on');
  });

  it('renders its SSR markup and stays dead when it is missing from defs', async () => {
    await serveIntoDom(jsx(Toggle as any, {}));

    expect(document.querySelector('janux-island[data-jx="toggle#default"]')).not.toBeNull();
    boot({ defs: [], webmcp: false });
    (document.querySelector('.toggle') as HTMLElement).click();
    await Bun.sleep(20);

    expect(document.querySelector('.toggle')!.textContent).toBe('off');
  });
});

describe('recipes/monorepo-setup.md — static components and app-owned apis', () => {
  it('a shared static component renders with no island wrapper at all', async () => {
    const { Badge } = await docExample('apps/docs/content/recipes/monorepo-setup.md', 0);
    const { html } = await renderToString(jsx(Badge, { label: 'shared' }), {});

    expect(html).toBe('<span class="badge">shared</span>');
    expect(html).not.toContain('janux-island');
  });

  it('the api() tool name comes from the app module and export, not the package', async () => {
    const module = await docExample('apps/docs/content/recipes/monorepo-setup.md', 2, BILLING_STUB);
    const [tool, ...rest] = collectApis({ billing: module });

    expect(rest).toEqual([]);
    expect(tool!.name).toBe('billing.charge');
    expect(await invokeApi(tool!, { customerId: 'cus_1' }, {}, 'human')).toBe('charged:cus_1');
  });

  it('the CLI resolves the app from cwd — there is no --root flag', () => {
    const parsed = parseArgs(['build', '--root', '/elsewhere'], '/repo/apps/web');

    expect(parsed.root).toBe('/repo/apps/web'); // the flag is ignored, cwd wins
  });
});
