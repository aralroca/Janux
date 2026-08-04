/**
 * Dev-only mirror of what `installWebMCP` last registered. The native
 * `document.modelContext` keeps its tools internal by design (only the
 * polyfill can enumerate), so the devtools panel reads this record instead —
 * written by webmcp.ts behind `import.meta.env?.DEV`, zero bytes in prod.
 */
export interface RegisteredWebMCPTool {
  name: string;
  description?: string;
}

let registered: RegisteredWebMCPTool[] = [];

export function recordWebMCPTools(tools: RegisteredWebMCPTool[]): void {
  registered = tools;
}

export function registeredWebMCPTools(): RegisteredWebMCPTool[] {
  return registered;
}
