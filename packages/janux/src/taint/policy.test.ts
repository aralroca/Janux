import { describe, expect, it } from 'bun:test';
import { guardUnderTaint, originUnderTaint } from './policy';

describe('originUnderTaint', () => {
  it('leaves an untainted chain alone', () => {
    expect(originUnderTaint('human', false)).toBe('human');
    expect(originUnderTaint('agent', false)).toBe('agent');
    expect(originUnderTaint('human', undefined)).toBe('human');
  });

  /** A tool result carrying untrusted content cannot claim a human asked for what follows. */
  it('a tainted chain can never present itself as human', () => {
    expect(originUnderTaint('human', true)).toBe('agent');
    expect(originUnderTaint('agent', true)).toBe('agent');
  });
});

describe('guardUnderTaint', () => {
  it('leaves an untainted chain alone', () => {
    expect(guardUnderTaint('auto', 'irreversible', false)).toBe('auto');
    expect(guardUnderTaint('auto', undefined, true)).toBe('auto');
  });

  it('degrades auto to confirm for an irreversible effect reached from tainted content', () => {
    expect(guardUnderTaint('auto', 'irreversible', true)).toBe('confirm');
  });

  it('never loosens a guard', () => {
    expect(guardUnderTaint('confirm', 'irreversible', true)).toBe('confirm');
    expect(guardUnderTaint('forbidden', 'irreversible', true)).toBe('forbidden');
    expect(guardUnderTaint('forbidden', undefined, true)).toBe('forbidden');
  });
});
