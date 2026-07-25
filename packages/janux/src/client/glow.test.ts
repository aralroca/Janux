import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { glowTargetFor } from './glow';

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

/** An island whose search field is bound to `search` through onInput. */
const ISLAND = `
  <janux-island data-jx="users#default">
    <input id="q" data-jxe-input="users#default:search" />
    <button data-jxa="users#default:clear">clear</button>
  </janux-island>`;

describe('glowTargetFor', () => {
  it('resolves intents bound to rich events, not just clicks and submits', () => {
    document.body.innerHTML = ISLAND;

    // A click-bound intent already pointed at its control…
    expect(glowTargetFor('users.clear')!.tagName).toBe('BUTTON');
    // …and so must one bound to onInput, instead of lighting the whole island.
    expect(glowTargetFor('users.search')!.id).toBe('q');
  });

  it('has no target inside a hidden panel: a ring on an unpainted box lands in the page corner', () => {
    document.body.innerHTML = `<section style="display:none">${ISLAND}</section>`;

    expect(glowTargetFor('users.search')).toBeUndefined();
  });

  /**
   * A tab bar, a table of rows, a list of "add to cart" buttons: several controls
   * delegate to ONE intent and only their `data-input` tells them apart. Marker
   * alone lit the first one — "go to the Workflows tab" glowed the Users tab.
   */
  it('picks the control whose data-input matches the call, not just the first marked one', () => {
    document.body.innerHTML = `
      <janux-island data-jx="console#default">
        <button data-jxa="console#default:goToTab" data-input='{"tab":"users"}'>Users</button>
        <button data-jxa="console#default:goToTab" data-input='{"tab":"workflows"}'>Workflows</button>
      </janux-island>`;

    expect(glowTargetFor('console.goToTab', { tab: 'workflows' })!.textContent).toBe('Workflows');
    expect(glowTargetFor('console.goToTab', { tab: 'users' })!.textContent).toBe('Users');
    // An agent may pass more than the control declares: the declared part must match.
    expect(glowTargetFor('console.goToTab', { tab: 'workflows', from: 'chat' })!.textContent).toBe('Workflows');
    // No input to disambiguate with → the first marked control, as before.
    expect(glowTargetFor('console.goToTab')!.textContent).toBe('Users');
    expect(glowTargetFor('console.goToTab', { tab: 'nope' })!.textContent).toBe('Users');
  });

  it('falls back to the island when the intent has no element in the view', () => {
    document.body.innerHTML = ISLAND;

    expect(glowTargetFor('users.unbound')!.tagName).toBe('JANUX-ISLAND');
  });
});
