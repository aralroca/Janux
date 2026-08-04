import { describe, expect, it } from 'bun:test';
import { isValidCron, nextOccurrence } from './cron';

// Local-time helpers keep assertions timezone-agnostic, like the runtime itself.
const local = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi);

describe('cron field grammar', () => {
  it('accepts the five-field forms the docs promise', () => {
    const valid = [
      '* * * * *',
      '0 9 * * *',
      '*/15 * * * *',
      '0 9 * * 1-5',
      '0 9,17 * * *',
      '30 4 1 * *',
      '0 0 * * MON,WED,FRI',
      '0 0 1 JAN *',
      '0 12 * * SUN',
      '10-40/10 * * * *',
    ];

    for (const expression of valid) expect(isValidCron(expression)).toBe(true);
  });

  it('accepts the @-aliases', () => {
    for (const alias of ['@hourly', '@daily', '@midnight', '@weekly', '@monthly', '@yearly', '@annually']) {
      expect(isValidCron(alias)).toBe(true);
    }
  });

  /**
   * `0 0 30 2 *` parses cleanly and names an instant the calendar never has.
   * Treating it as valid buys a schedule that fails on every tick forever, so
   * "valid" has to mean "will actually fire".
   */
  it('rejects expressions that are well-formed but can never fire', () => {
    expect(isValidCron('0 0 30 2 *')).toBe(false);
    expect(isValidCron('0 0 31 4 *')).toBe(false);
    expect(() => nextOccurrence('0 0 30 2 *', new Date())).toThrow('cron_unsatisfiable:0 0 30 2 *');
    // The leap-year neighbour is reachable, so it stays valid.
    expect(isValidCron('0 0 29 2 *')).toBe(true);
  });

  /** `Number()` accepts far more than a cron field does; a silent 1e1 → 10 is a schedule nobody wrote. */
  it('rejects numbers that are not plain digits', () => {
    ['1e1 * * * *', '0x10 * * * *', '+5 * * * *', '5.0 * * * *'].forEach((expression) =>
      expect(isValidCron(expression)).toBe(false),
    );
  });

  it('rejects malformed expressions', () => {
    const invalid = ['', '   ', '* * * *', '* * * * * *', '99 99 * * *', '*/0 * * * *', 'a b c d e', '0 9 * * 8-9', '@fortnightly'];

    for (const expression of invalid) expect(isValidCron(expression)).toBe(false);
    expect(() => nextOccurrence('99 99 * * *', new Date())).toThrow('invalid_cron:99 99 * * *');
  });
});

describe('nextOccurrence', () => {
  it('finds the next daily time, rolling to tomorrow when today is past', () => {
    expect(nextOccurrence('0 9 * * *', local(2026, 3, 10, 8, 30))).toEqual(local(2026, 3, 10, 9, 0));
    expect(nextOccurrence('0 9 * * *', local(2026, 3, 10, 9, 30))).toEqual(local(2026, 3, 11, 9, 0));
  });

  it('is strictly after the reference instant, even on an exact boundary', () => {
    expect(nextOccurrence('0 9 * * *', local(2026, 3, 10, 9, 0))).toEqual(local(2026, 3, 11, 9, 0));
  });

  it('advances when fed its own output', () => {
    const first = nextOccurrence('*/15 * * * *', local(2026, 3, 10, 10, 7));
    const second = nextOccurrence('*/15 * * * *', first);

    expect(first).toEqual(local(2026, 3, 10, 10, 15));
    expect(second).toEqual(local(2026, 3, 10, 10, 30));
  });

  it('honours ranges with steps', () => {
    expect(nextOccurrence('10-40/10 * * * *', local(2026, 3, 10, 10, 41))).toEqual(local(2026, 3, 10, 11, 10));
  });

  it('skips the weekend for weekday schedules', () => {
    // 2026-03-13 is a Friday.
    expect(nextOccurrence('0 9 * * 1-5', local(2026, 3, 13, 10, 0))).toEqual(local(2026, 3, 16, 9, 0));
  });

  it('resolves day and month names', () => {
    expect(nextOccurrence('0 12 * * SUN', local(2026, 3, 13, 10, 0))).toEqual(local(2026, 3, 15, 12, 0));
    expect(nextOccurrence('0 0 1 JAN *', local(2026, 3, 13, 10, 0))).toEqual(local(2027, 1, 1, 0, 0));
  });

  it('treats 0 and 7 as the same Sunday', () => {
    const after = local(2026, 3, 13, 10, 0);

    expect(nextOccurrence('0 6 * * 7', after)).toEqual(nextOccurrence('0 6 * * 0', after));
  });

  it('fires on either field when day-of-month and day-of-week are both restricted', () => {
    // Standard cron quirk: restricted DOM and DOW match as a union.
    // From Tue 2026-03-10: Friday the 13th comes before the next 20th.
    expect(nextOccurrence('0 0 13 * 5', local(2026, 3, 10, 0, 0))).toEqual(local(2026, 3, 13, 0, 0));
    expect(nextOccurrence('0 0 20 * 5', local(2026, 3, 14, 0, 0))).toEqual(local(2026, 3, 20, 0, 0));
  });

  /** `FRI-MON` and `22-2` are ordinary crontab; rejecting them is an incompatibility, not a safeguard. */
  it('wraps a range that crosses the end of the field', () => {
    // 2026-03-10 is a Tuesday: the next FRI-MON day is Friday the 13th.
    expect(nextOccurrence('0 0 * * FRI-MON', local(2026, 3, 10, 12, 0))).toEqual(local(2026, 3, 13, 0, 0));
    expect(nextOccurrence('0 22-2 * * *', local(2026, 3, 10, 23, 30))).toEqual(local(2026, 3, 11, 0, 0));
    expect(nextOccurrence('0 22-2 * * *', local(2026, 3, 10, 2, 30))).toEqual(local(2026, 3, 10, 22, 0));
  });

  /**
   * Standard cron reads a day field that STARTS with a star as unrestricted, so
   * the two day fields are ANDed. Reading only a bare star that way turns a
   * stepped day plus MON into "every other day OR every Monday" — four times
   * the runs anybody asked for.
   */
  it('ands the day fields when one of them starts with a star', () => {
    // `*/2` on day-of-month counts from 1, so it means the odd days. The next
    // Monday that is also an odd day is the 23rd — the 16th is a Monday too,
    // and a union reading would wrongly stop there.
    expect(nextOccurrence('0 0 */2 * 1', local(2026, 3, 10, 0, 0))).toEqual(local(2026, 3, 23, 0, 0));
    // Both restricted without a star: the union, as cron has always done it.
    expect(nextOccurrence('0 0 13 * 5', local(2026, 3, 10, 0, 0))).toEqual(local(2026, 3, 13, 0, 0));
  });

  /** The next 29 February after 2096 is 2104: 2100 is not a leap year. */
  it('reaches a leap day across a century that skips one', () => {
    expect(nextOccurrence('0 0 29 2 *', local(2096, 3, 1, 0, 0))).toEqual(local(2104, 2, 29, 0, 0));
    expect(isValidCron('0 0 29 2 *')).toBe(true);
  });

  it('expands the aliases to their five-field equivalents', () => {
    const after = local(2026, 3, 10, 10, 7);

    expect(nextOccurrence('@hourly', after)).toEqual(local(2026, 3, 10, 11, 0));
    expect(nextOccurrence('@midnight', after)).toEqual(local(2026, 3, 11, 0, 0));
    expect(nextOccurrence('@weekly', after)).toEqual(local(2026, 3, 15, 0, 0));
    expect(nextOccurrence('@monthly', after)).toEqual(local(2026, 4, 1, 0, 0));
    expect(nextOccurrence('@yearly', after)).toEqual(local(2027, 1, 1, 0, 0));
  });

  it('never lands on a day the calendar does not have', () => {
    // 31st of the month: April has 30 days, so from April it lands on May 31st.
    expect(nextOccurrence('0 0 31 * *', local(2026, 4, 1, 0, 0))).toEqual(local(2026, 5, 31, 0, 0));
    // Feb 29 only exists in leap years: from March 2026 the next one is in 2028.
    expect(nextOccurrence('0 0 29 2 *', local(2026, 3, 1, 0, 0))).toEqual(local(2028, 2, 29, 0, 0));
  });
});
