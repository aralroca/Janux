/**
 * Dependency-free cron parsing (RFC 0002 §20): five fields — minute, hour,
 * day-of-month, month, day-of-week — plus the common @-aliases. Times are
 * interpreted in the runtime's local timezone. When both day fields are
 * restricted they match as a union, the standard cron quirk.
 */

const ALIASES: Record<string, string> = {
  '@hourly': '0 * * * *',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@weekly': '0 0 * * 0',
  '@monthly': '0 0 1 * *',
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
};

const MONTH_NAMES: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

const DAY_NAMES: Record<string, number> = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };

const ITEM = /^(\*|[a-z0-9]+(?:-[a-z0-9]+)?)(?:\/(\d+))?$/i;

interface Field {
  /** Starts with a star — what standard cron calls unrestricted, and what ands the two day fields. */
  star: boolean;
  values: Set<number>;
}

interface Cron {
  minute: Field;
  hour: Field;
  dayOfMonth: Field;
  month: Field;
  dayOfWeek: Field;
}

function component(token: string, min: number, max: number, names: Record<string, number>): number {
  // Plain digits only: `Number()` would take `1e1`, `0x10` and ` 5` and turn a
  // typo into a schedule that runs at a time nobody wrote.
  const value = names[token.toUpperCase()] ?? (/^\d+$/.test(token) ? Number(token) : NaN);

  if (!Number.isInteger(value) || value < min || value > max) throw new Error('invalid_field');

  return value;
}

/** `22-2` and `FRI-MON` are ordinary crontab: a range that wraps is two ranges. */
function span(from: number, to: number, min: number, max: number, stride: number): number[] {
  const length = (to >= from ? to - from : max - min + 1 - (from - to)) + 1;

  return Array.from({ length }, (_, i) => from + i).filter((_, i) => i % stride === 0).map((value) => ((value - min) % (max - min + 1)) + min);
}

function expandItem(item: string, min: number, max: number, names: Record<string, number>): number[] {
  const match = item.match(ITEM);

  if (!match) throw new Error('invalid_field');

  const [, field = '', step] = match;
  const stride = step === undefined ? 1 : Number(step);
  const [from, rawTo] = field === '*' ? [min, max] : field.split('-').map((part) => component(part, min, max, names));
  // A single value with a step (`5/15`) ranges to the field maximum, as in Vixie cron.
  const to = rawTo ?? (step === undefined ? from! : max);

  if (stride < 1) throw new Error('invalid_field');

  return span(from!, to, min, max, stride);
}

function expandField(spec: string, min: number, max: number, names: Record<string, number> = {}): Field {
  const values = new Set(spec.split(',').flatMap((item) => expandItem(item, min, max, names)));

  return { star: spec.startsWith('*'), values };
}

function foldSunday(field: Field): Field {
  const values = new Set([...field.values].map((day) => (day === 7 ? 0 : day)));

  return { ...field, values };
}

function parseCron(expression: string): Cron {
  const normalized = ALIASES[expression.trim().toLowerCase()] ?? expression.trim();
  const parts = normalized.split(/\s+/);

  if (parts.length !== 5) throw new Error(`invalid_cron:${expression}`);
  try {
    return {
      minute: expandField(parts[0]!, 0, 59),
      hour: expandField(parts[1]!, 0, 23),
      dayOfMonth: expandField(parts[2]!, 1, 31),
      month: expandField(parts[3]!, 1, 12, MONTH_NAMES),
      dayOfWeek: foldSunday(expandField(parts[4]!, 0, 7, DAY_NAMES)),
    };
  } catch {
    throw new Error(`invalid_cron:${expression}`);
  }
}

/**
 * Valid means "will actually fire". `0 0 30 2 *` parses cleanly and names a
 * date the calendar never has — accepting it buys a schedule that throws on
 * every tick instead of a boot failure, so the reachability check is part of
 * validation rather than a separate courtesy.
 */
export function isValidCron(expression: string): boolean {
  try {
    nextOccurrence(expression, new Date());

    return true;
  } catch {
    return false;
  }
}

/**
 * The oldest quirk in cron: when *both* day fields are restricted they match as
 * a union, and when either is unrestricted (starts with a star) they match as
 * an intersection.
 */
function dayMatches(cron: Cron, date: Date): boolean {
  const domMatch = cron.dayOfMonth.values.has(date.getDate());
  const dowMatch = cron.dayOfWeek.values.has(date.getDay());

  return cron.dayOfMonth.star || cron.dayOfWeek.star ? domMatch && dowMatch : domMatch || dowMatch;
}

function toNextMonth(cursor: Date): void {
  cursor.setMonth(cursor.getMonth() + 1, 1);
  cursor.setHours(0, 0, 0, 0);
}

function toNextDay(cursor: Date): void {
  cursor.setDate(cursor.getDate() + 1);
  cursor.setHours(0, 0, 0, 0);
}

function nextMatch(cron: Cron, cursor: Date, limit: Date): Date | undefined {
  while (cursor <= limit) {
    if (!cron.month.values.has(cursor.getMonth() + 1)) toNextMonth(cursor);
    else if (!dayMatches(cron, cursor)) toNextDay(cursor);
    else if (!cron.hour.values.has(cursor.getHours())) cursor.setHours(cursor.getHours() + 1, 0, 0, 0);
    else if (!cron.minute.values.has(cursor.getMinutes())) cursor.setMinutes(cursor.getMinutes() + 1);
    else return cursor;
  }

  return undefined;
}

/** The first instant matching `expression` strictly after `after`, at minute precision. */
export function nextOccurrence(expression: string, after: Date): Date {
  const cron = parseCron(expression);
  // Minute-truncated and one ahead: a boundary hit rolls to the next occurrence.
  const cursor = new Date(after.getFullYear(), after.getMonth(), after.getDate(), after.getHours(), after.getMinutes() + 1);
  // Nine years covers the sparsest satisfiable schedule: 29 February, whose gap
  // stretches to eight years across a century that skips a leap day (2096 →
  // 2104). Beyond that an expression is well-formed but names nothing reachable.
  const limit = new Date(after.getFullYear() + 9, after.getMonth(), after.getDate());
  const found = nextMatch(cron, cursor, limit);

  if (!found) throw new Error(`cron_unsatisfiable:${expression}`);

  return found;
}
