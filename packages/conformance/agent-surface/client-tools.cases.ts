import { allowsTool, type ToolFilter } from '@janux/agent';
import { CLIENT_TOOL_NAMES, CLIENT_TOOL_SPECS } from 'janux';
import type { ScenarioCase } from '../support/scenario';

/**
 * The built-in browser tools, and the one filter that decides which tools reach
 * a model.
 *
 * `CLIENT_TOOL_SPECS` is pure data shared by the server-side tool list and the
 * browser bridge that executes them, so a drift between the two is a tool the
 * model can name and nothing can run. `allowsTool` is the other half: the same
 * selection semantics for `defineAgent({ tools })` and `createCopilot({ tools })`,
 * because an app that hides a tool from one agent must not expose it to the other.
 */

const spec = (name: string) => CLIENT_TOOL_SPECS.find((entry) => entry.name === name)!;
const params = (name: string) => spec(name).parameters as { type: string; properties: Record<string, unknown>; required: string[] };

const allows = (name: string, filter: ToolFilter | undefined) => (allowsTool(name, filter) ? 'yes' : 'no');

export const CLIENT_TOOLS_CASES: ScenarioCase[] = [
  // ── the built-in surface ────────────────────────────────────────────────────
  {
    id: 'agent2-client-tools-every-app-ships-the-same-browser-tools',
    src: 'janux',
    run: (log) => log.push(CLIENT_TOOL_SPECS.map((entry) => entry.name).join(',')),
    expected: ['ui_navigate,ui_get_view_context,ui_read_page,ui_click,ui_fill,ui_wait_settled'],
  },
  {
    id: 'agent2-client-tools-are-all-namespaced-under-ui',
    src: 'janux',
    run: (log) => log.push(`prefixed=${CLIENT_TOOL_SPECS.every((entry) => entry.name.startsWith('ui_'))}`),
    expected: ['prefixed=true'],
  },
  {
    id: 'agent2-client-tool-names-are-snake-case',
    src: 'janux',
    run: (log) => log.push(`shaped=${CLIENT_TOOL_SPECS.every((entry) => /^[a-z][a-z0-9_]*$/.test(entry.name))}`),
    expected: ['shaped=true'],
  },
  {
    id: 'agent2-no-two-client-tools-share-a-name',
    src: 'janux',
    run: (log) => log.push(`unique=${new Set(CLIENT_TOOL_SPECS.map((entry) => entry.name)).size === CLIENT_TOOL_SPECS.length}`),
    expected: ['unique=true'],
  },
  {
    id: 'agent2-the-client-tool-name-set-matches-the-specs-exactly',
    src: 'janux',
    run: (log) => {
      const fromSpecs = CLIENT_TOOL_SPECS.map((entry) => entry.name);

      log.push(`size=${CLIENT_TOOL_NAMES.size === fromSpecs.length} covers=${fromSpecs.every((name) => CLIENT_TOOL_NAMES.has(name))}`);
    },
    expected: ['size=true covers=true'],
  },
  {
    id: 'agent2-a-name-that-is-not-a-client-tool-is-not-in-the-set',
    src: 'janux',
    run: (log) => log.push(`api=${CLIENT_TOOL_NAMES.has('api.shop.read')} navigate=${CLIENT_TOOL_NAMES.has('navigate')}`),
    expected: ['api=false navigate=false'],
  },
  {
    id: 'agent2-every-client-tool-describes-itself-for-a-model',
    src: 'janux',
    run: (log) => log.push(`described=${CLIENT_TOOL_SPECS.every((entry) => entry.description.length > 20)}`),
    expected: ['described=true'],
  },
  {
    id: 'agent2-every-client-tool-declares-an-object-parameter-schema',
    src: 'janux',
    run: (log) => {
      const shapes = CLIENT_TOOL_SPECS.map((entry) => (entry.parameters as { type: string }).type);

      log.push([...new Set(shapes)].join(','));
    },
    expected: ['object'],
  },
  {
    id: 'agent2-every-client-tool-states-which-of-its-parameters-are-required',
    src: 'janux',
    run: (log) => log.push(`declared=${CLIENT_TOOL_SPECS.every((entry) => Array.isArray((entry.parameters as { required: unknown }).required))}`),
    expected: ['declared=true'],
  },
  {
    id: 'agent2-a-required-client-tool-parameter-is-always-a-declared-property',
    src: 'janux',
    run: (log) => {
      const consistent = CLIENT_TOOL_SPECS.every((entry) => {
        const { properties, required } = entry.parameters as { properties: Record<string, unknown>; required: string[] };

        return required.every((name) => name in properties);
      });

      log.push(`consistent=${consistent}`);
    },
    expected: ['consistent=true'],
  },

  // ── the individual contracts ────────────────────────────────────────────────
  {
    id: 'agent2-navigating-takes-a-path-and-nothing-else',
    src: 'janux',
    run: (log) => {
      const { properties, required } = params('ui_navigate');

      log.push(`${Object.keys(properties).join(',')} required=${required.join(',')}`);
    },
    expected: ['path required=path'],
  },
  {
    id: 'agent2-the-navigate-path-is-described-with-an-example-a-model-can-copy',
    src: 'janux',
    run: (log) => {
      const path = params('ui_navigate').properties.path as { type: string; description: string };

      log.push(`${path.type} example=${path.description.includes('/console')}`);
    },
    expected: ['string example=true'],
  },
  {
    id: 'agent2-clicking-takes-a-selector',
    src: 'janux',
    run: (log) => {
      const { properties, required } = params('ui_click');

      log.push(`${Object.keys(properties).join(',')} required=${required.join(',')}`);
    },
    expected: ['selector required=selector'],
  },
  {
    id: 'agent2-filling-takes-a-selector-and-a-value-and-needs-both',
    src: 'janux',
    run: (log) => {
      const { properties, required } = params('ui_fill');

      log.push(`${Object.keys(properties).join(',')} required=${required.join(',')}`);
    },
    expected: ['selector,value required=selector,value'],
  },
  {
    id: 'agent2-reading-the-view-context-takes-no-arguments',
    src: 'janux',
    run: (log) => {
      const { properties, required } = params('ui_get_view_context');

      log.push(`${Object.keys(properties).length} ${required.length}`);
    },
    expected: ['0 0'],
  },
  {
    id: 'agent2-reading-the-page-takes-no-arguments-either',
    src: 'janux',
    run: (log) => {
      const { properties, required } = params('ui_read_page');

      log.push(`${Object.keys(properties).length} ${required.length}`);
    },
    expected: ['0 0'],
  },
  {
    id: 'agent2-waiting-for-the-app-to-settle-takes-no-arguments',
    src: 'janux',
    run: (log) => {
      const { properties, required } = params('ui_wait_settled');

      log.push(`${Object.keys(properties).length} ${required.length}`);
    },
    expected: ['0 0'],
  },
  {
    id: 'agent2-the-dom-fallbacks-say-they-are-fallbacks',
    src: 'janux',
    run: (log) => {
      const fallbacks = ['ui_click', 'ui_fill'].map((name) => spec(name).description.includes('Fallback when no dedicated tool exists'));

      log.push(`${fallbacks.join(',')}`);
    },
    expected: ['true,true'],
  },
  {
    id: 'agent2-reading-the-page-promises-selectors-the-other-tools-accept',
    src: 'janux',
    run: (log) => log.push(`stable=${spec('ui_read_page').description.includes('stable selectors')}`),
    expected: ['stable=true'],
  },
  {
    id: 'agent2-the-settle-tool-tells-a-model-when-to-use-it',
    src: 'janux',
    run: (log) => log.push(`ordered=${spec('ui_wait_settled').description.includes('Call after navigation')}`),
    expected: ['ordered=true'],
  },

  // ── which tools reach the model ─────────────────────────────────────────────
  {
    id: 'agent2-tool-filter-without-a-filter-every-tool-is-allowed',
    src: 'janux',
    run: (log) => log.push(allows('api.shop.read', undefined)),
    expected: ['yes'],
  },
  {
    id: 'agent2-tool-filter-an-empty-filter-allows-everything',
    src: 'janux',
    run: (log) => log.push(allows('api.shop.read', {})),
    expected: ['yes'],
  },
  {
    id: 'agent2-tool-filter-an-empty-allowlist-means-every-mounted-tool',
    src: 'janux',
    run: (log) => log.push(allows('api.shop.read', { include: [] })),
    expected: ['yes'],
  },
  {
    id: 'agent2-tool-filter-an-allowlist-admits-an-exact-name',
    src: 'janux',
    run: (log) => log.push(`listed=${allows('api.shop.read', { include: ['api.shop.read'] })} other=${allows('api.shop.pay', { include: ['api.shop.read'] })}`),
    expected: ['listed=yes other=no'],
  },
  {
    id: 'agent2-tool-filter-a-trailing-star-admits-a-whole-namespace',
    src: 'janux',
    run: (log) => log.push(`inside=${allows('api.docs.search', { include: ['api.docs.*'] })} outside=${allows('api.shop.read', { include: ['api.docs.*'] })}`),
    expected: ['inside=yes outside=no'],
  },
  {
    id: 'agent2-tool-filter-a-name-without-a-star-never-matches-by-prefix',
    src: 'janux',
    run: (log) => log.push(allows('api.docs.search', { include: ['api.docs'] })),
    expected: ['no'],
  },
  {
    id: 'agent2-tool-filter-a-lone-star-admits-everything',
    src: 'janux',
    run: (log) => log.push(allows('anything.at.all', { include: ['*'] })),
    expected: ['yes'],
  },
  {
    id: 'agent2-tool-filter-names-are-matched-case-sensitively',
    src: 'janux',
    run: (log) => log.push(allows('api.Shop.read', { include: ['api.shop.read'] })),
    expected: ['no'],
  },
  {
    id: 'agent2-tool-filter-a-denylist-removes-a-tool-nothing-else-mentioned',
    src: 'janux',
    run: (log) => log.push(`denied=${allows('api.shop.nuke', { exclude: ['api.shop.nuke'] })} other=${allows('api.shop.read', { exclude: ['api.shop.nuke'] })}`),
    expected: ['denied=no other=yes'],
  },
  {
    id: 'agent2-tool-filter-exclude-wins-over-include',
    src: 'janux',
    run: (log) => log.push(allows('api.shop.nuke', { include: ['api.shop.*'], exclude: ['api.shop.nuke'] })),
    expected: ['no'],
  },
  {
    id: 'agent2-tool-filter-a-denylist-namespace-removes-the-whole-namespace',
    src: 'janux',
    run: (log) => log.push(`inside=${allows('api.admin.drop', { exclude: ['api.admin.*'] })} outside=${allows('api.shop.read', { exclude: ['api.admin.*'] })}`),
    expected: ['inside=no outside=yes'],
  },
  {
    id: 'agent2-tool-filter-an-empty-denylist-removes-nothing',
    src: 'janux',
    run: (log) => log.push(allows('api.shop.read', { exclude: [] })),
    expected: ['yes'],
  },
  {
    id: 'agent2-tool-filter-applies-to-the-prefixed-name-a-remote-tool-arrives-under',
    src: 'janux',
    run: (log) => log.push(`prefixed=${allows('didit.search', { include: ['didit.*'] })} bare=${allows('search', { include: ['didit.*'] })}`),
    expected: ['prefixed=yes bare=no'],
  },
  {
    id: 'agent2-tool-filter-treats-a-browser-tool-like-any-other',
    src: 'janux',
    run: (log) => log.push(`kept=${allows('ui_navigate', { include: ['ui_*'] })} dropped=${allows('ui_click', { exclude: ['ui_click'] })}`),
    expected: ['kept=yes dropped=no'],
  },
];
