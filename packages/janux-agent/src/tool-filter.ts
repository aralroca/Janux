/**
 * One tool-selection semantics for the whole package: `defineAgent({ tools })`
 * (server loop) and `createCopilot({ tools })` (browser loop) must agree, or an
 * app that hides a tool from one agent quietly exposes it to the other.
 */
export interface ToolFilter {
  /** Allowlist. Empty or absent means "every mounted tool". */
  include?: string[];
  /** Removed after `include` — exclude always wins. */
  exclude?: string[];
}

/** `'api.docs.*'` matches by prefix; anything else has to match exactly. */
function matches(name: string, pattern: string): boolean {
  return pattern.endsWith('*') ? name.startsWith(pattern.slice(0, -1)) : name === pattern;
}

export function allowsTool(name: string, filter: ToolFilter | undefined): boolean {
  const { include, exclude } = filter ?? {};
  const included = !include?.length || include.some((pattern) => matches(name, pattern));

  return included && !exclude?.some((pattern) => matches(name, pattern));
}
