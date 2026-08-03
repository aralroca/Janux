import { describe, expect, it } from 'bun:test';
import { launchTarget } from './browser';

/**
 * The CI matrix picks the engine through JANUX_E2E_BROWSER; everything else —
 * a developer's machine, a suite run by hand — must keep getting the branded
 * Chrome the suite has always driven.
 */
describe('the e2e browser choice', () => {
  it('defaults to Chromium on the Chrome channel', () => {
    expect(launchTarget(undefined)).toEqual({ browser: 'chromium', options: { channel: 'chrome' } });
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
