/**
 * Harness storage abstraction (RFC 0002 §21): an adapter interface — not a
 * data layer. The in-memory reference adapter backs tests and local dev; a
 * SQL adapter plugs in for production (threads/messages/snapshots tables).
 */

export interface ThreadRecord {
  id: string;
  resourceId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface MessageRecord {
  id: string;
  threadId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: unknown;
  createdAt: number;
}

export interface HarnessStorage {
  getThread(id: string): Promise<ThreadRecord | undefined>;
  listThreads(resourceId: string): Promise<ThreadRecord[]>;
  saveThread(thread: ThreadRecord): Promise<void>;
  deleteThread(id: string): Promise<void>;
  appendMessage(message: MessageRecord): Promise<void>;
  listMessages(threadId: string, limit?: number): Promise<MessageRecord[]>;
  /** Durable workflow snapshots, keyed by run id. */
  saveSnapshot(runId: string, snapshot: unknown): Promise<void>;
  loadSnapshot(runId: string): Promise<unknown | undefined>;
  deleteSnapshot(runId: string): Promise<void>;
}

export function createMemoryStorage(): HarnessStorage {
  const threads = new Map<string, ThreadRecord>();
  const messages = new Map<string, MessageRecord[]>();
  const snapshots = new Map<string, unknown>();

  return {
    async getThread(id) {
      return threads.get(id);
    },
    async listThreads(resourceId) {
      return [...threads.values()]
        .filter((thread) => thread.resourceId === resourceId)
        .sort((a, b) => b.updatedAt - a.updatedAt);
    },
    async saveThread(thread) {
      threads.set(thread.id, thread);
    },
    async deleteThread(id) {
      threads.delete(id);
      messages.delete(id);
    },
    async appendMessage(message) {
      const list = messages.get(message.threadId) ?? [];

      list.push(message);
      messages.set(message.threadId, list);
    },
    async listMessages(threadId, limit) {
      const list = messages.get(threadId) ?? [];

      return limit ? list.slice(-limit) : [...list];
    },
    async saveSnapshot(runId, snapshot) {
      snapshots.set(runId, snapshot);
    },
    async loadSnapshot(runId) {
      return snapshots.get(runId);
    },
    async deleteSnapshot(runId) {
      snapshots.delete(runId);
    },
  };
}
