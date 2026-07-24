import { signal, type Sig } from '../signals';
import { validate, type JxType } from '../schema';

/** A reactive, typed binding to the URL query string (nuqs-style). */
export interface UrlStateHandle<T> {
  value: Sig<T>;
  set(next: T): void;
}

export interface UrlStateOptions {
  /** Replace history entry instead of pushing (default: true — filters shouldn't spam history). */
  replace?: boolean;
}

function readParam<T>(name: string, type: JxType, fallback: T): T {
  // SSR has no query string to read: the server renders the fallback and the
  // island corrects itself on mount (query-only state is client-side by design).
  if (typeof location === 'undefined') return fallback;
  const raw = new URLSearchParams(location.search).get(name);

  if (raw === null) return fallback;
  const parsed = /^[[{]/.test(raw) ? safeJson(raw) : raw;
  const result = validate(type, parsed);

  return result.ok ? (result.value as T) : fallback;
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function writeParam(name: string, value: unknown, fallback: unknown, replace: boolean): void {
  const params = new URLSearchParams(location.search);

  if (value === fallback || value === undefined || value === null || value === '') params.delete(name);
  else params.set(name, typeof value === 'object' ? JSON.stringify(value) : String(value));
  const query = params.toString();
  const url = `${location.pathname}${query ? `?${query}` : ''}`;

  // Query-only same-path change: the router treats it as shallow (no re-render).
  history[replace ? 'replaceState' : 'pushState']({}, '', url);
}

/**
 * Binds one query-string param to a schema-typed signal. The URL is the source
 * of truth (deep-linkable, back-button-correct); `set` writes it back. Reacts
 * to back/forward via popstate.
 */
export function urlState<T>(
  name: string,
  type: JxType,
  fallback: T,
  options: UrlStateOptions = {},
): UrlStateHandle<T> {
  const replace = options.replace ?? true;
  const value = signal<T>(readParam(name, type, fallback));
  const onPop = () => {
    value.value = readParam(name, type, fallback);
  };

  if (typeof window !== 'undefined') window.addEventListener('popstate', onPop);

  return {
    value,
    set(next: T) {
      value.value = next;
      writeParam(name, next, fallback, replace);
    },
  };
}
