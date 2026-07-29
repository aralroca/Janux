/**
 * Deployment knobs, kept dependency-free so routes can render them without
 * pulling the agent runtime into the page bundle.
 */

/** 5 questions per minute per identity — small on purpose so the 429 is easy to see. */
export const RATE_LIMIT = { limit: 5, windowMs: 60_000 };

export interface BackendSummary {
  storage: 'postgres' | 'in-memory';
  rateLimitStore: 'redis' | 'in-memory';
}

/** Which backend each harness piece runs on, decided by env presence alone. */
export function backendSummary(): BackendSummary {
  return {
    storage: process.env.DATABASE_URL ? 'postgres' : 'in-memory',
    rateLimitStore: process.env.REDIS_URL ? 'redis' : 'in-memory',
  };
}
