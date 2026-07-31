---
title: Agent memory & storage
description: "Conversation state for the built-in copilot: threads, messages and a history window, on a storage adapter you choose. Guide: The agent and your copilot."
---

# Agent memory & storage

Conversation state for the built-in copilot: threads, messages and a history window, on a storage adapter you choose. Guide: [The agent and your copilot](/docs/guide/agent-and-copilot).

```ts
import { createMemory, createMemoryStorage, createPgStorage } from '@janux/agent';
```

## createMemory(options)

```ts
const memory = createMemory({
  storage: createMemoryStorage(),
  lastMessages: 20,
  generateTitle: (first) => first.slice(0, 60),
});
```

| `MemoryOptions` | Default | What it does |
|---|---|---|
| `storage` | *(required)* | The `HarnessStorage` adapter |
| `lastMessages` | `20` | History window handed to the model per turn |
| `generateTitle` | — | `(firstMessage) => string \| Promise<string>` — names a thread from its first user message |
| `now` | `Date.now` | Injectable clock, for deterministic tests |

### The three methods

| Method | Signature | Notes |
|---|---|---|
| `ensureThread` | `(threadId \| undefined, resourceId) => Promise<ThreadRecord>` | Creates the thread when absent. **Fails closed**: an existing thread whose `resourceId` differs throws `thread_forbidden`, so a guessed thread id can't leak another user's conversation |
| `remember` | `(thread, role, content) => Promise<void>` | Appends a message (`user` / `assistant` / `system` / `tool`) and bumps the thread's `updatedAt` |
| `history` | `(threadId) => Promise<ChatMessage[]>` | The last `lastMessages` messages, oldest-first, as provider-shaped messages |

`resourceId` is the ownership key — a user id, an org id, whatever your `identityFor` returns. Threads are always scoped by it.

## The storage contract

`HarnessStorage` is nine methods, so a custom backend (Redis, SQLite, DynamoDB, your own API) is a small object:

```ts
interface HarnessStorage {
  getThread(id): Promise<ThreadRecord | undefined>;
  listThreads(resourceId): Promise<ThreadRecord[]>;   // newest first
  saveThread(thread): Promise<void>;
  deleteThread(id): Promise<void>;
  appendMessage(message): Promise<void>;
  listMessages(threadId, limit?): Promise<MessageRecord[]>;
  saveSnapshot(runId, snapshot): Promise<void>;       // durable workflows
  loadSnapshot(runId): Promise<unknown | undefined>;
  deleteSnapshot(runId): Promise<void>;
}
```

`ThreadRecord` is `{ id, resourceId, title, createdAt, updatedAt }`; `MessageRecord` is `{ id, threadId, role, content, createdAt }`. The snapshot trio is what makes [durable workflows](/docs/reference/agent-workflows) survive a restart — the same adapter serves both.

## createMemoryStorage()

In-memory adapter: the zero-config default and the right choice for tests. `listThreads` returns newest-first. State dies with the process, so don't ship it as the only store for a multi-instance deployment.

## createPgStorage(options)

```ts
const storage = await createPgStorage({ connectionString: process.env.DATABASE_URL!, max: 20 });
```

Postgres adapter. It **creates its own tables on first use** (`janux_threads`, `janux_messages`, `janux_snapshots`), so there's no migration step to forget. `max` is the pool size (default `20`). `pg` is imported dynamically — apps that never call this don't pay for the dependency.

The returned object is a `HarnessStorage` plus `close(): Promise<void>`; call it on shutdown (and in tests) to drain the pool.

## Wiring it into an agent

```ts
export default defineAgent({
  instructions: 'You are the shop copilot.',
  harness: {
    memory: createMemory({ storage: await createPgStorage({ connectionString: process.env.DATABASE_URL! }) }),
  },
});
```

`harness.memory` takes the `HarnessMemory` that `createMemory` returns — the storage adapter alone is not enough, because the memory layer is what owns the history window and thread ownership.

Related: [The agent and your copilot](/docs/guide/agent-and-copilot) · [Agent guardrails](/docs/reference/agent-guardrails) · [Durable workflows](/docs/reference/agent-workflows)
