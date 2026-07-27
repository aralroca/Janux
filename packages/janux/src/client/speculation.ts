import { CONFIG_SCRIPT_ID, SPECULATION_SCRIPT_ID, speculationRules, type NavigationConfig } from '../config';

/** `janux.config.ts`'s navigation section, shipped by the shell as a keyed script. */
export function shellNavigationConfig(): NavigationConfig {
  const script = document.getElementById(CONFIG_SCRIPT_ID);

  try {
    return JSON.parse(script?.textContent ?? '{}').navigation ?? {};
  } catch {
    return {};
  }
}

/**
 * Narrows the rules the server emitted to the links the browser still
 * navigates itself.
 *
 * The server has to emit document-wide rules — at that point nothing knows
 * whether this browser intercepts — so this runs once at boot AND after every
 * navigation, because the incoming page brings its own wide copy and the diff
 * applies it faithfully. The config is read back from the document each time
 * (the shell ships it as a keyed script). Rules are re-evaluated by replacing
 * the script; editing its text is not enough.
 */
export function rescopeSpeculationRules(): void {
  const existing = document.getElementById(SPECULATION_SCRIPT_ID);

  if (!existing) return;
  const rules = speculationRules(shellNavigationConfig().speculationRules ?? true, { nativeOnly: true });
  const script = document.createElement('script');

  // Navigation responses already ship the narrow rules; replacing the script
  // would make the browser drop its speculation candidates for nothing.
  if (rules && existing.textContent === JSON.stringify(rules)) return;
  existing.remove();
  if (!rules) return;
  script.type = 'speculationrules';
  script.id = SPECULATION_SCRIPT_ID;
  script.textContent = JSON.stringify(rules);
  document.head.appendChild(script);
}
