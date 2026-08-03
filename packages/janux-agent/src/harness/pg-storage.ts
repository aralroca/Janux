import type { HarnessStorage, MessageRecord, ScheduleRecord, ScheduleStore, ThreadRecord } from './storage';

/**
 * Postgres storage adapter (RFC 0002 §21): the production backend for harness
 * memory and workflow snapshots. Tables are auto-created (janux_* namespace)
 * on first use. `pg` is an optional peer — imported dynamically so apps
 * without the harness pay nothing.
 */

export interface PgStorageOptions {
  connectionString: string;
  /** Pool size (assistant parity: 20). */
  max?: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS janux_threads (
  id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS janux_threads_resource ON janux_threads (resource_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS janux_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES janux_threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content JSONB NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS janux_messages_thread ON janux_messages (thread_id, created_at);
CREATE TABLE IF NOT EXISTS janux_snapshots (
  run_id TEXT PRIMARY KEY,
  snapshot JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS janux_schedules (
  name TEXT PRIMARY KEY,
  cron TEXT NOT NULL,
  next_run BIGINT NOT NULL,
  locked_until BIGINT,
  state JSONB,
  last_run BIGINT,
  last_status TEXT,
  last_error TEXT
);
`;

interface PgPool {
  query(text: string, values?: unknown[]): Promise<{ rows: any[] }>;
  end(): Promise<void>;
}

function toThread(row: any): ThreadRecord {
  return {
    id: row.id,
    resourceId: row.resource_id,
    title: row.title,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function toSchedule(row: any): ScheduleRecord {
  return {
    name: row.name,
    cron: row.cron,
    nextRun: Number(row.next_run),
    lease: row.locked_until === null ? undefined : Number(row.locked_until),
    state: row.state ?? undefined,
    lastRun: row.last_run === null ? undefined : Number(row.last_run),
    lastStatus: row.last_status ?? undefined,
    lastError: row.last_error ?? undefined,
  };
}

export async function createPgStorage(
  options: PgStorageOptions,
): Promise<HarnessStorage & ScheduleStore & { close(): Promise<void> }> {
  const { Pool } = (await import('pg')).default ?? (await import('pg'));
  const pool: PgPool = new Pool({ connectionString: options.connectionString, max: options.max ?? 20 });

  await pool.query(SCHEMA);

  return {
    async getThread(id) {
      const { rows } = await pool.query('SELECT * FROM janux_threads WHERE id = $1', [id]);

      return rows[0] ? toThread(rows[0]) : undefined;
    },
    async listThreads(resourceId) {
      const { rows } = await pool.query(
        'SELECT * FROM janux_threads WHERE resource_id = $1 ORDER BY updated_at DESC',
        [resourceId],
      );

      return rows.map(toThread);
    },
    async saveThread(thread) {
      await pool.query(
        `INSERT INTO janux_threads (id, resource_id, title, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET title = $3, updated_at = $5`,
        [thread.id, thread.resourceId, thread.title, thread.createdAt, thread.updatedAt],
      );
    },
    async deleteThread(id) {
      await pool.query('DELETE FROM janux_threads WHERE id = $1', [id]);
    },
    async appendMessage(message: MessageRecord) {
      await pool.query(
        'INSERT INTO janux_messages (id, thread_id, role, content, created_at) VALUES ($1, $2, $3, $4, $5)',
        [message.id, message.threadId, message.role, JSON.stringify(message.content), message.createdAt],
      );
    },
    async listMessages(threadId, limit) {
      const { rows } = await pool.query(
        `SELECT * FROM (
           SELECT * FROM janux_messages WHERE thread_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2
         ) latest ORDER BY created_at ASC, id ASC`,
        [threadId, limit ?? 1000],
      );

      return rows.map((row) => ({
        id: row.id,
        threadId: row.thread_id,
        role: row.role,
        content: row.content,
        createdAt: Number(row.created_at),
      }));
    },
    async saveSnapshot(runId, snapshot) {
      await pool.query(
        `INSERT INTO janux_snapshots (run_id, snapshot) VALUES ($1, $2)
         ON CONFLICT (run_id) DO UPDATE SET snapshot = $2`,
        [runId, JSON.stringify(snapshot)],
      );
    },
    async loadSnapshot(runId) {
      const { rows } = await pool.query('SELECT snapshot FROM janux_snapshots WHERE run_id = $1', [runId]);

      return rows[0]?.snapshot;
    },
    async deleteSnapshot(runId) {
      await pool.query('DELETE FROM janux_snapshots WHERE run_id = $1', [runId]);
    },
    async syncSchedules(seeds) {
      await pool.query('DELETE FROM janux_schedules WHERE name <> ALL($1)', [seeds.map((seed) => seed.name)]);
      for (const seed of seeds) {
        await pool.query(
          `INSERT INTO janux_schedules (name, cron, next_run) VALUES ($1, $2, $3)
           ON CONFLICT (name) DO UPDATE SET cron = $2,
             next_run = CASE WHEN janux_schedules.cron = $2 THEN janux_schedules.next_run ELSE $3 END,
             locked_until = CASE WHEN janux_schedules.cron = $2 THEN janux_schedules.locked_until ELSE NULL END`,
          [seed.name, seed.cron, seed.nextRun],
        );
      }
    },
    async claimDueSchedules(now, leaseMs) {
      // A single UPDATE … RETURNING is the atomic lease: a concurrent worker
      // blocks on the row lock, re-evaluates the WHERE, and walks away empty.
      const { rows } = await pool.query(
        `UPDATE janux_schedules SET locked_until = $1 + $2
         WHERE next_run <= $1 AND (locked_until IS NULL OR locked_until <= $1)
         RETURNING *`,
        [now, leaseMs],
      );

      return rows.map(toSchedule);
    },
    async settleSchedule(name, outcome, lease) {
      // `locked_until IS NOT DISTINCT FROM` rather than `=`: a caller with no
      // lease to prove writes unconditionally, one with a stale lease writes
      // nothing — its claim belongs to somebody else now.
      await pool.query(
        `UPDATE janux_schedules
         SET locked_until = NULL, next_run = $2, last_run = $3, last_status = $4, last_error = $5
         WHERE name = $1 AND ($6::BIGINT IS NULL OR locked_until IS NOT DISTINCT FROM $6)`,
        [name, outcome.nextRun, outcome.lastRun, outcome.lastStatus, outcome.lastError ?? null, lease ?? null],
      );
    },
    async saveScheduleState(name, state, lease) {
      await pool.query(
        `UPDATE janux_schedules SET state = $2
         WHERE name = $1 AND ($3::BIGINT IS NULL OR locked_until IS NOT DISTINCT FROM $3)`,
        [name, JSON.stringify(state), lease ?? null],
      );
    },
    close: () => pool.end(),
  };
}
