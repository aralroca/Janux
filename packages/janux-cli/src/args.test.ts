import { describe, expect, it } from 'bun:test';
import { HELP_TEXT, parseArgs } from './args';

describe('janux CLI args', () => {
  it('parses commands and the port flag', () => {
    expect(parseArgs(['dev', '--port', '4000'], '/app')).toEqual({
      command: 'dev',
      port: 4000,
      root: '/app',
      files: [],
      url: 'http://localhost:3000',
      startCommand: undefined,
      json: false,
    });
    expect(parseArgs(['build'], '/app').command).toBe('build');
    expect(parseArgs(['start'], '/app').command).toBe('start');
    expect(parseArgs(['verify'], '/app').command).toBe('verify');
    expect(parseArgs(['info'], '/app').command).toBe('info');
  });

  it('parses eval files and flags', () => {
    const parsed = parseArgs(
      ['eval', 'evals/a.eval.json', '--url', 'http://localhost:4000', '--start', 'janux start', '--json'],
      '/app',
    );

    expect(parsed.command).toBe('eval');
    expect(parsed.files).toEqual(['evals/a.eval.json']);
    expect(parsed.url).toBe('http://localhost:4000');
    expect(parsed.startCommand).toBe('janux start');
    expect(parsed.json).toBe(true);
  });

  it('falls back to help on unknown commands', () => {
    expect(parseArgs(['nope'], '/app').command).toBe('help');
    expect(parseArgs([], '/app').command).toBe('help');
    expect(HELP_TEXT).toContain('janux dev');
    expect(HELP_TEXT).toContain('janux info');
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
