# Durable agent — the harness in production shape

The complete `@janux/agent` harness wired the way you would deploy it: state in Postgres, counters in Redis, guardrails in front of every turn, and a multi-step workflow that survives a restart. Without a `.env` the same code falls back to in-memory adapters, so `bun run dev` works on a bare machine.

- **Postgres memory** — `createPgStorage` keeps threads and messages in `janux_threads`/`janux_messages`; kill the process, start it again, and the conversation history is still there.
- **Redis rate limiting** — `createRedisCounterStore` shares one fixed-window budget (5 requests/min per identity) across every instance; the sixth question inside a window gets a `429 rate_limited`.
- **Guardrails** — `unicodeNormalizer` plus an `injectionGuard` classifier screen every turn; hostile input is aborted with a typed refusal carrying the app's own `refusalMessage`, the model never sees it.
- **Durable workflow** — `provisioning` suspends on a human question and resumes from a snapshot in the same storage — hours later, in another process, state intact.
- **No model key required** — the copilot answers with a setup card until you configure one, while memory, guardrails and rate limiting stay fully active.

```bash
docker-compose up -d          # Postgres 16 + Redis 7
cp .env.example .env
bun install
bun run dev   # http://localhost:4321
```

The whole wiring is one call per concern:

```ts
import { defineAgent, createMemory, createPgStorage, createRedisCounterStore } from '@janux/agent';

export default defineAgent({
  instructions: 'You are the workspace copilot of a durable Janux deployment.',
  harness: {
    memory: createMemory({ storage: await createPgStorage({ connectionString: process.env.DATABASE_URL! }) }),
    refusalMessage: 'I can’t help with that request. Ask me about your workspace instead.',
    rateLimit: { limit: 5, windowMs: 60_000, store: await createRedisCounterStore({ redis: process.env.REDIS_URL! }) },
    identityFor: (request) => request.headers.get('x-user-id') ?? 'anonymous',
  },
});
```

## Where things live

| File | What it shows |
|---|---|
| `src/agent.ts` | `defineAgent` with the full `harness` config built from the environment |
| `src/server/harness.ts` | Storage, counter store, memory, limiter and identity — Postgres/Redis when configured, in-memory fallback otherwise |
| `src/server/guardrails.ts` | The processor chain, the injection classifier and the `refusalMessage` the refusal carries |
| `src/server/workflow.ts` | The `provisioning` workflow: suspend on a human question, resume after a restart |
| `src/server/config.ts` | Rate-limit knobs and the backend summary the page renders |
| `src/routes/index.tsx` | The SSR page reporting which backend each piece runs on |
| `docker-compose.yml` | Postgres 16 + Redis 7 matching `.env.example` |
