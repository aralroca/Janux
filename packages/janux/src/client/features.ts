/**
 * A boot feature is CODE the app imports, not a flag: `boot({ glow: agentGlow() })`
 * ships the glow layer because the entry references it, and `boot()` alone ships
 * none of it. A boolean could never do that — `boot({ glow: true })` forced the
 * runtime to import every optional layer for every app, used or not.
 */
export interface BootFeature {
  /**
   * Runs during `boot()` with the shared island context. The returned callback
   * (if any) re-runs after every SPA navigation, for features that read
   * per-page payloads — i18n re-reads the new page's dictionary this way.
   */
  install(ctx: Record<string, unknown>): (() => void) | undefined | void;
}
