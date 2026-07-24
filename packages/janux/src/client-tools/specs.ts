/**
 * Built-in client tool contracts — pure data, shared by the embedded agent
 * (tool list, server-side) and the browser bridge (execution, client-side).
 * These give any agent app-wide control: navigation, view context and a DOM
 * fallback for surfaces without a dedicated intent.
 */

export interface ClientToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties,
  required,
});

export const CLIENT_TOOL_SPECS: ClientToolSpec[] = [
  {
    name: 'ui_navigate',
    description:
      'Navigate the app to a same-origin path (SPA navigation). Use the routes list and the current page links to pick the destination; query params are allowed (e.g. ?tab=settings).',
    parameters: obj({ path: { type: 'string', description: 'Target path, e.g. /console/team/app/transactions?tab=settings' } }, ['path']),
  },
  {
    name: 'ui_get_view_context',
    description: 'Read the current view: path, title, same-origin links and mounted components.',
    parameters: obj({}),
  },
  {
    name: 'ui_read_page',
    description:
      'Accessibility snapshot of the current page: headings, buttons, inputs and links with stable selectors. Use it when no dedicated tool covers what you need.',
    parameters: obj({}),
  },
  {
    name: 'ui_click',
    description: 'Click an element by CSS selector (from ui_read_page). Fallback when no dedicated tool exists.',
    parameters: obj({ selector: { type: 'string' } }, ['selector']),
  },
  {
    name: 'ui_fill',
    description: 'Fill an input/textarea by CSS selector with a value. Fallback when no dedicated tool exists.',
    parameters: obj({ selector: { type: 'string' }, value: { type: 'string' } }, ['selector', 'value']),
  },
  {
    name: 'ui_wait_settled',
    description: 'Wait until the app is quiescent (all pending effects/queries settled). Call after navigation or actions before reading state.',
    parameters: obj({}),
  },
];

export const CLIENT_TOOL_NAMES = new Set(CLIENT_TOOL_SPECS.map((spec) => spec.name));
