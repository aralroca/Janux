import { bool, enums, int, list, money, num, obj, str } from 'janux';
import { attempt, type ScenarioCase } from '../support/scenario';

/**
 * Schema construction: what the builders accept, and what they refuse outright.
 *
 * `min()`/`max()` mean length for a string and value for a number. On every other
 * kind the flag was simply never read — `list(int()).min(2)` accepted `[1]`, and
 * `bool().min(2)` rejected `true` with "below min 2". A constraint that silently
 * does nothing is worse than one that refuses to be written, so building it now
 * throws at the point of the mistake.
 */
const BOUNDS_MESSAGE = (method: string, kind: string) =>
  `${method}:threw:Janux: ${method}() is not defined for ${kind} — bounds are length for strings and value for numbers.`;

export const BUILDER_CASES: ScenarioCase[] = [
  // ── the kinds bounds are defined for ────────────────────────────────────────
  { id: 'build-min-is-allowed-on-a-string', src: 'janux', run: (log) => attempt(log, 'min', () => str().min(1)), expected: ['min:ok'] },
  { id: 'build-min-is-allowed-on-an-int', src: 'janux', run: (log) => attempt(log, 'min', () => int().min(1)), expected: ['min:ok'] },
  { id: 'build-min-is-allowed-on-a-number', src: 'janux', run: (log) => attempt(log, 'min', () => num().min(1)), expected: ['min:ok'] },
  { id: 'build-min-is-allowed-on-money', src: 'janux', run: (log) => attempt(log, 'min', () => money().min(1)), expected: ['min:ok'] },
  { id: 'build-max-is-allowed-on-a-string', src: 'janux', run: (log) => attempt(log, 'max', () => str().max(1)), expected: ['max:ok'] },
  { id: 'build-max-is-allowed-on-an-int', src: 'janux', run: (log) => attempt(log, 'max', () => int().max(1)), expected: ['max:ok'] },

  // ── the kinds where it was a silent no-op ───────────────────────────────────
  { id: 'build-min-refuses-a-list', src: 'janux', run: (log) => attempt(log, 'min', () => list(int()).min(2)), expected: [BOUNDS_MESSAGE('min', 'list')] },
  { id: 'build-max-refuses-a-list', src: 'janux', run: (log) => attempt(log, 'max', () => list(int()).max(2)), expected: [BOUNDS_MESSAGE('max', 'list')] },
  { id: 'build-min-refuses-an-object', src: 'janux', run: (log) => attempt(log, 'min', () => obj({ n: int() }).min(1)), expected: [BOUNDS_MESSAGE('min', 'object')] },
  { id: 'build-max-refuses-an-object', src: 'janux', run: (log) => attempt(log, 'max', () => obj({ n: int() }).max(1)), expected: [BOUNDS_MESSAGE('max', 'object')] },
  { id: 'build-min-refuses-a-boolean', src: 'janux', run: (log) => attempt(log, 'min', () => bool().min(1)), expected: [BOUNDS_MESSAGE('min', 'boolean')] },
  { id: 'build-max-refuses-a-boolean', src: 'janux', run: (log) => attempt(log, 'max', () => bool().max(1)), expected: [BOUNDS_MESSAGE('max', 'boolean')] },
  { id: 'build-min-refuses-an-enum', src: 'janux', run: (log) => attempt(log, 'min', () => enums(['a']).min(1)), expected: [BOUNDS_MESSAGE('min', 'enum')] },
  { id: 'build-max-refuses-an-enum', src: 'janux', run: (log) => attempt(log, 'max', () => enums(['a']).max(1)), expected: [BOUNDS_MESSAGE('max', 'enum')] },
  { id: 'build-bounds-are-refused-after-other-modifiers-too', src: 'janux', run: (log) => attempt(log, 'min', () => list(int()).optional().min(1)), expected: [BOUNDS_MESSAGE('min', 'list')] },

  // ── chaining is immutable ───────────────────────────────────────────────────
  {
    id: 'build-modifiers-do-not-mutate-the-original-type',
    src: 'janux',
    run: (log) => {
      const base = int();
      const bounded = base.min(5);

      log.push(`base:${base.flags.min}`, `bounded:${bounded.flags.min}`);
    },
    expected: ['base:undefined', 'bounded:5'],
  },
  {
    id: 'build-chaining-accumulates-every-flag',
    src: 'janux',
    run: (log) => {
      const type = int().min(1).max(9).optional().default(3);

      log.push(JSON.stringify([type.flags.min, type.flags.max, type.flags.optional, type.flags.defaultValue]));
    },
    expected: ['[1,9,true,3]'],
  },
  {
    id: 'build-chaining-preserves-the-list-item-type',
    src: 'janux',
    run: (log) => log.push(String(list(int()).optional().item?.kind)),
    expected: ['int'],
  },
  {
    id: 'build-chaining-preserves-the-object-shape',
    src: 'janux',
    run: (log) => log.push(Object.keys(obj({ a: int(), b: str() }).nullable().shape ?? {}).join(',')),
    expected: ['a,b'],
  },
  {
    id: 'build-chaining-preserves-enum-members',
    src: 'janux',
    run: (log) => log.push((enums(['a', 'b']).optional().values ?? []).join(',')),
    expected: ['a,b'],
  },
  {
    id: 'build-a-later-bound-overrides-an-earlier-one',
    src: 'janux',
    run: (log) => log.push(String(int().min(1).min(5).flags.min)),
    expected: ['5'],
  },
  {
    id: 'build-list-accepts-a-bare-shape-and-wraps-it-in-an-object',
    src: 'janux',
    run: (log) => log.push(String(list({ n: int() }).item?.kind)),
    expected: ['object'],
  },
  {
    id: 'build-list-accepts-a-type-directly',
    src: 'janux',
    run: (log) => log.push(String(list(str()).item?.kind)),
    expected: ['string'],
  },
];
