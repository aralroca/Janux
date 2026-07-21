export type BusHandler = (payload: unknown) => void;

export interface EventBus {
  emit(event: string, payload: unknown): void;
  on(event: string, handler: BusHandler): () => void;
}

/** Typed event bus: local component events, store events and server events share it. */
export function createBus(): EventBus {
  const handlers = new Map<string, Set<BusHandler>>();

  return {
    emit(event, payload) {
      handlers.get(event)?.forEach((handler) => handler(payload));
    },
    on(event, handler) {
      const set = handlers.get(event) ?? new Set();

      handlers.set(event, set);
      set.add(handler);

      return () => set.delete(handler);
    },
  };
}
