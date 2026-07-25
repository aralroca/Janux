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

  it('falls back to the island when the intent has no element in the view', () => {
    document.body.innerHTML = ISLAND;

    expect(glowTargetFor('users.unbound')!.tagName).toBe('JANUX-ISLAND');
  });
});
