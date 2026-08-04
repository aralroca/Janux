import type { AuditEntry, Ctx } from 'janux';
import type { ManifestTool } from 'janux/manifest';
import type { createJanuxServer } from '@janux/server';

/** A manifest tool plus the page it was found mounted on (`api()` tools belong to no page). */
export interface RunnableTool extends ManifestTool {
  route?: string;
}

/** Where the answers go, and who — if anyone — is there to give one. */
export interface RunIo {
  out(text: string): void;
  err(text: string): void;
  /** Absent ⇒ nobody is at the terminal, so a `confirm` guard has no one to answer it. */
  ask?(question: string): string | null;
}

export interface RunTarget {
  server: ReturnType<typeof createJanuxServer>;
  ctx: Ctx;
  /** Absolute base for the in-process HTTP calls an `api()` tool travels through. */
  base?: string;
  onAudit?: (entry: AuditEntry) => void;
}
