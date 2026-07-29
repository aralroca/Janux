import { describe, expect, it } from 'bun:test';
import { bool, enums, int, list, money, num, schema, str } from './builders';
import { coerceForm } from './coerce';
import { validate } from './validate';

const registration = schema({
  name: str().min(2),
  attendees: int().min(1),
  rating: num(),
  donation: money().min(0),
  optIn: bool().default(false),
  track: enums(['frontend', 'backend']),
});

describe('schema coerceForm', () => {
  it('coerces numeric strings to what the typed schema means', () => {
    const input = { name: 'Ada', attendees: '3', rating: '4.5', donation: '1250', track: 'frontend' };
    const result = validate(registration, coerceForm(input, registration));

    expect(result.ok).toBe(true);
    expect(result.value).toEqual({
      name: 'Ada',
      attendees: 3,
      rating: 4.5,
      donation: 1250,
      optIn: false,
      track: 'frontend',
    });
  });

  it('applies checkbox semantics to booleans: "on"/"true" check, absence unchecks', () => {
    expect(coerceForm('on', bool())).toBe(true);
    expect(coerceForm('true', bool())).toBe(true);
    expect(coerceForm(undefined, bool())).toBe(false);
  });

  it("coerces 'false'/'off' to false — the hidden-input and select idioms", () => {
    const type = schema({ optIn: bool() });

    expect(coerceForm({ optIn: 'false' }, type)).toEqual({ optIn: false });
    expect(coerceForm({ optIn: 'off' }, type)).toEqual({ optIn: false });
  });

  it('leaves an absent optional/nullable boolean absent — an agent omitting it must not get false', () => {
    const optional = schema({ flag: bool().optional(), other: str() });
    const nullable = schema({ flag: bool().nullable(), other: str() });

    expect(coerceForm({ other: 'x' }, optional)).toEqual({ other: 'x', flag: undefined });
    expect(coerceForm({ other: 'x' }, nullable)).toEqual({ other: 'x', flag: undefined });
  });

  it('keeps a blank numeric field invalid instead of turning it into 0', () => {
    const input = { name: 'Ada', attendees: '', rating: '1', donation: '0', track: 'frontend' };
    const result = validate(registration, coerceForm(input, registration));

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([{ path: 'attendees', message: 'expected int' }]);
  });

  it('keeps a non-numeric string invalid', () => {
    expect(coerceForm('not-a-number', int())).toBe('not-a-number');
    expect(coerceForm('   ', num())).toBe('   ');
  });

  it('passes already-typed input through untouched (an agent sends real JSON)', () => {
    const input = { name: 'Ada', attendees: 3, rating: 4.5, donation: 1250, optIn: true, track: 'backend' };

    expect(coerceForm(input, registration)).toEqual(input);
  });

  it('never scales money — minor units in, minor units out', () => {
    expect(coerceForm('1250', money())).toBe(1250);
    // "12.5" parses to 12.5, which money() (an integer of minor units) still rejects.
    expect(validate(money(), coerceForm('12.5', money())).ok).toBe(false);
  });

  it('leaves strings and enums alone', () => {
    expect(coerceForm('42', str())).toBe('42');
    expect(coerceForm('frontend', enums(['frontend']))).toBe('frontend');
  });

  it('recurses into lists and nested objects', () => {
    const nested = schema({ seats: list(int()), guest: schema({ age: int() }) });
    const result = validate(nested, coerceForm({ seats: ['1', '2'], guest: { age: '30' } }, nested));

    expect(result.ok).toBe(true);
    expect(result.value).toEqual({ seats: [1, 2], guest: { age: 30 } });
  });
});
