---
title: Agent rate limiting
description: Per-identity limits on copilot turns, with a global circuit breaker.
---

# Agent rate limiting

Per-identity limits on copilot turns, with a global circuit breaker. The counter store is pluggable, which is what makes the limiter correct across several instances.

It guards **both** agent mounts: `POST /_janux/agent` (the server loop) and `POST /_janux/llm` (the one-turn model proxy browser loops use). They share the key and the budget, because they share the bill — protecting one door and leaving the other open just moves the abuse.

```ts
import { createRateLimiter, createMemoryCounterStore, createRedisCounterStore } from '@janux/agent';

export default defineAgent({
  harness: {
    identityFor: (request) => request.headers.get('x-user-id') ?? 'anonymous',
    rateLimit: { limit: 20, windowMs: 60_000, globalLimit: 500 },
  },
});
```

## createRateLimiter(config)

| `RateLimitConfig` | Default | What it does |
|---|---|---|
| `limit` | *(required)* | Requests per identity per window |
| `windowMs` | *(required)* | Window length in milliseconds |
| `globalLimit` | off | Circuit breaker across **all** identities — the guard against a bill-shaped incident when one bug hammers the endpoint from many sessions |
| `store` | `createMemoryCounterStore()` | Where counters live |

The returned `RateLimiter` has one method, `allow(identity): Promise<boolean>`.

**It fails open.** If the counter store throws — Redis unreachable, network blip — the request is allowed. Losing the limiter degrades your cost control; failing closed would take your copilot down. Pair the limiter with alerting on store errors so an outage is visible rather than silent.

## The store contract

```ts
interface CounterStore {
  incr(key: string, windowMs: number): number | Promise<number>;
}
```

One method: increment the key inside the current window, return the new count. That's the whole seam a custom backend has to implement.

### createMemoryCounterStore(now?)

Per-process counters, injectable clock for tests. Correct for a single instance — and **wrong the moment you run two**: each replica would allow the full limit, so N replicas mean N×limit. Fine in dev, not in production behind a load balancer.

### createRedisCounterStore(options)

```ts
const store = await createRedisCounterStore({ redis: process.env.REDIS_URL!, keyPrefix: 'janux:rl:' });
```

| `RedisCounterOptions` | Notes |
|---|---|
| `redis` | An ioredis connection string **or** an existing client (anything with `incr` and `pexpire`) — reuse the client you already have rather than opening a second connection |
| `keyPrefix` | Namespace for the counter keys |

Shared counters mean the limit is the limit, whatever the replica count. `INCR` + `PEXPIRE` keeps the window self-expiring, so there's nothing to clean up.

## identityFor

`harness.identityFor(request)` decides *who* is being limited: a user id, an API key, a session, an org. Return a stable string. Without it, every caller shares one bucket — usually not what you want, and the reason a limiter can look "broken" when it's actually limiting everyone together.

Related: [The agent and your copilot](/docs/guide/agent-and-copilot) · [Agent guardrails](/docs/reference/agent-guardrails) · [Agent memory & storage](/docs/reference/agent-memory)
