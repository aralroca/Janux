import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { launchTarget } from './browser';

/**
 * The CI matrix picks the engine through JANUX_E2E_BROWSER; everything else —
 * a developer's machine, a suite run by hand — must keep getting the branded
 * Chrome the suite has always driven. The variable is cleared around each case:
 * this file itself runs inside the matrix lanes, where it is set.
 */
describe('the e2e browser choice', () => {
  let ambient: string | undefined;

  beforeEach(() => {
    ambient = process.env.JANUX_E2E_BROWSER;
    delete process.env.JANUX_E2E_BROWSER;
  });

  afterEach(() => {
    if (ambient !== undefined) process.env.JANUX_E2E_BROWSER = ambient;
  });

  it('defaults to Chromium on the Chrome channel when the variable is unset', () => {
    expect(launchTarget()).toEqual({ browser: 'chromium', options: { channel: 'chrome' } });
  });

  it('treats an empty variable as unset', () => {
    expect(launchTarget('')).toEqual({ browser: 'chromium', options: { channel: 'chrome' } });
  });

  it('answers the firefox and webkit lanes of the CI matrix', () => {
    expect(launchTarget('firefox')).toEqual({ browser: 'firefox', options: {} });
    expect(launchTarget('webkit')).toEqual({ browser: 'webkit', options: {} });
  });

  it('refuses an engine it does not know rather than silently testing another', () => {
    expect(() => launchTarget('safari')).toThrow('JANUX_E2E_BROWSER');
  });
});
