import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll } from 'bun:test';

/**
 * The single Happy-DOM registration point for the corpus.
 *
 * Deliberately NOT a `bunfig.toml` preload: a global registration would hand
 * `document` to the server-side corpus too and flip every
 * `typeof document !== 'undefined'` branch in Janux. Registration is per file,
 * paired with an unregister, exactly like the co-located client tests do —
 * Bun runs test files sequentially, so the pairing is what keeps them isolated.
 *
 * Call once at the top level of a DOM test file, then group many `describe`s
 * under it: registration is the expensive part, so files stay few and fat.
 */
export function useDom(): void {
  beforeAll(() => GlobalRegistrator.register());
  afterAll(() => GlobalRegistrator.unregister());
}

/** Wipes the document between describes so they share one window without re-registering. */
export function resetDocument(): void {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  document.documentElement.removeAttribute('dir');
  document.documentElement.removeAttribute('lang');
}
