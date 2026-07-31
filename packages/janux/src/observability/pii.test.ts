import { afterEach, describe, expect, it } from 'bun:test';
import { defaultPiiFilter, scrubAttributes, setPiiFilter } from './pii';

afterEach(() => setPiiFilter(undefined));

describe('the default PII filter', () => {
  it('redacts emails', () => {
    expect(defaultPiiFilter('failed for ada@example.com')).toBe('failed for [email]');
  });

  it('redacts international phone numbers but leaves bare digit runs alone', () => {
    expect(defaultPiiFilter('call +34 600 123 456')).toBe('call [phone]');
    // Ids, timestamps and amounts are the signal an operator debugs with.
    expect(defaultPiiFilter('order 600123456 at 1753876800')).toBe('order 600123456 at 1753876800');
  });

  it('truncates payload bytes instead of exporting them', () => {
    const dataUrl = `data:image/png;base64,${'A'.repeat(600)}`;

    expect(defaultPiiFilter(dataUrl)).toMatch(/^\[data-url truncated, \d+ chars\]$/);
    expect(defaultPiiFilter('B'.repeat(600))).toMatch(/^\[base64 truncated, \d+ chars\]$/);
  });

  it('leaves ordinary framework attributes untouched', () => {
    expect(defaultPiiFilter('/orders/[id]')).toBe('/orders/[id]');
  });
});

describe('scrubbing span attributes', () => {
  it('filters string values and passes numbers and booleans through', () => {
    const scrubbed = scrubAttributes({ 'janux.route': '/u/ada@example.com', tokens: 42, ok: true });

    expect(scrubbed).toEqual({ 'janux.route': '/u/[email]', tokens: 42, ok: true });
  });

  it('uses the filter the app registered', () => {
    setPiiFilter(() => '[gone]');

    expect(scrubAttributes({ 'janux.route': '/orders' })).toEqual({ 'janux.route': '[gone]' });
  });

  it('fails closed: a filter that throws redacts the value rather than leaking it', () => {
    setPiiFilter(() => {
      throw new Error('bad filter');
    });

    expect(scrubAttributes({ 'janux.route': '/u/ada@example.com' })).toEqual({
      'janux.route': '[redacted: pii filter failed]',
    });
  });

  it('restores the default filter when the app clears it', () => {
    setPiiFilter(() => '[gone]');
    setPiiFilter(undefined);

    expect(scrubAttributes({ 'janux.route': '/u/ada@example.com' })).toEqual({ 'janux.route': '/u/[email]' });
  });
});
