import { describe, expect, it } from 'bun:test';
import { isNotFoundError, notFound } from './not-found';

describe('notFound()', () => {
  it('throws a signal the server recognizes', () => {
    expect(() => notFound()).toThrow();
    try {
      notFound();
    } catch (error) {
      expect(isNotFoundError(error)).toBe(true);
    }
  });

  it('does not claim ordinary failures — those are 500s, not 404s', () => {
    expect(isNotFoundError(new Error('boom'))).toBe(false);
    expect(isNotFoundError('not found')).toBe(false);
    expect(isNotFoundError(undefined)).toBe(false);
  });
});
