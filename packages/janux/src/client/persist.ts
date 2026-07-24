import { effect as watch, untrack } from '../signals';
import type { JanuxInstance } from '../runtime/instance';

/** Pluggable storage backend (localStorage by default; async-capable). */
export interface StateStorage {
  getItem(name: string): string | null | Promise<string | null>;
  setItem(name: string, value: string): void | Promise<void>;
  removeItem(name: string): void | Promise<void>;
}

export interface PersistConfig {
  /** Storage key; defaults to `janux:store:<name>`. */
  name?: string;
  storage?: StateStorage;
  /** Persist only part of the state. */
  partialize?: (state: Record<string, unknown>) => Record<string, unknown>;
  version?: number;
  /** Migrate a persisted payload from an older version. */
  migrate?: (persisted: Record<string, unknown>, from: number) => Record<string, unknown>;
}

interface Envelope {
  v: number;
  s: Record<string, unknown>;
}

function defaultStorage(): StateStorage | undefined {
  return typeof localStorage !== 'undefined' ? localStorage : undefined;
}

/**
 * Rehydrate a store from storage and keep it in sync. Called by the client
 * store bootstrap for any store declaring `persist: 'local'` (or a config).
 * Returns a disposer that stops the write-back effect.
 */
export async function persistStore(instance: JanuxInstance, config: PersistConfig = {}): Promise<() => void> {
  const storage = config.storage ?? defaultStorage();

  if (!storage) return () => {};
  const key = config.name ?? `janux:store:${instance.def.name}`;
  const version = config.version ?? 0;
  const raw = await storage.getItem(key);

  if (raw) {
    try {
      const envelope = JSON.parse(raw) as Envelope;
      // A payload from another version is only trustworthy through `migrate`.
      // Without one it is dropped, not applied: booting with state this code no
      // longer understands is worse than booting from defaults.
      const migrated = envelope.v === version ? envelope.s : config.migrate?.(envelope.s, envelope.v);

      if (migrated) instance.patch(migrated);
    } catch {
      // Corrupt payload: ignore and start from defaults.
    }
  }

  return watch(() => {
    // Read through the proxy so every touched path is tracked — snapshot()
    // clones the raw backing object and would not establish dependencies.
    const tracked = JSON.parse(JSON.stringify(instance.state)) as Record<string, unknown>;
    const persisted = config.partialize ? config.partialize(tracked) : tracked;

    untrack(() => {
      const payload: Envelope = { v: version, s: persisted };

      Promise.resolve(storage.setItem(key, JSON.stringify(payload))).catch(() => undefined);
    });
  });
}
