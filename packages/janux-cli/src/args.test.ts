import { describe, expect, it } from 'bun:test';
import { HELP_TEXT, parseArgs } from './args';

describe('janux CLI args', () => {
  it('parses commands and the port flag', () => {
    expect(parseArgs(['dev', '--port', '4000'], '/app')).toEqual({
      command: 'dev',
      port: 4000,
      root: '/app',
    });
    expect(parseArgs(['build'], '/app').command).toBe('build');
    expect(parseArgs(['start'], '/app').command).toBe('start');
  });

  it('falls back to help on unknown commands', () => {
    expect(parseArgs(['nope'], '/app').command).toBe('help');
    expect(parseArgs([], '/app').command).toBe('help');
    expect(HELP_TEXT).toContain('janux dev');
  });

  it('rejects non-numeric ports', () => {
    expect(() => parseArgs(['dev', '--port', 'abc'], '/app')).toThrow(/--port/);
  });
});

describe('tailwind auto-detection', () => {
  it('returns undefined when @janux/tailwind is not installed', async () => {
    const { loadTailwindPlugin } = await import('./commands');

    expect(await loadTailwindPlugin('/tmp/definitely-not-a-janux-app')).toBeUndefined();
  });
});
