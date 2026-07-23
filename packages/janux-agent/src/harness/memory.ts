import type { ChatMessage } from '../providers';
import type { HarnessStorage, MessageRecord, ThreadRecord } from './storage';

export interface MemoryOptions {
  storage: HarnessStorage;
  /** History window per turn (didit-assistant parity: 20). */
  lastMessages?: number;
  /** Generates a thread title from the first user message. */
  generateTitle?: (firstMessage: string) => Promise<string> | string;
  now?: () => number;
}

let seq = 0;

function nextId(prefix: string, now: number): string {
  seq += 1;

  return `${prefix}_${now.toString(36)}_${seq}`;
}

/**
 * Persistent conversational memory (RFC 0002 §18): threads + messages over the
 * storage adapter, a bounded history window per turn, and lazy title
 * generation on the first user message.
 */
export function createMemory(options: MemoryOptions) {
  const { storage } = options;
  const lastMessages = options.lastMessages ?? 20;
  const now = options.now ?? (() => Date.now());

  return {
    async ensureThread(threadId: string | undefined, resourceId: string): Promise<ThreadRecord> {
      const existing = threadId ? await storage.getThread(threadId) : undefined;

      if (existing) {
        if (existing.resourceId !== resourceId) throw new Error('thread_forbidden');

        return existing;
      }
      const at = now();
      const thread: ThreadRecord = {
        id: threadId ?? nextId('thr', at),
        resourceId,
        title: 'New conversation',
        createdAt: at,
        updatedAt: at,
      };

      await storage.saveThread(thread);

      return thread;
    },

    async remember(thread: ThreadRecord, role: MessageRecord['role'], content: unknown): Promise<void> {
      await storage.appendMessage({ id: nextId('msg', now()), threadId: thread.id, role, content, createdAt: now() });
      const isFirstUserMessage = role === 'user' && thread.title === 'New conversation';

      if (isFirstUserMessage && options.generateTitle) {
        thread.title = await options.generateTitle(String(content).slice(0, 500));
      }
      thread.updatedAt = now();
      await storage.saveThread(thread);
    },

    /** The bounded chat history for a turn, oldest → newest. */
    async history(threadId: string): Promise<ChatMessage[]> {
      const records = await storage.listMessages(threadId, lastMessages);

      return records.map((record) => ({ role: record.role, content: record.content }) as ChatMessage);
    },

    listThreads: (resourceId: string) => storage.listThreads(resourceId),
    deleteThread: (id: string) => storage.deleteThread(id),
    getThread: (id: string) => storage.getThread(id),
  };
}

export type HarnessMemory = ReturnType<typeof createMemory>;
