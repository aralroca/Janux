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
      trials: 1,
      baseline: undefined,
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

  it('parses test with file filters passed through', () => {
    const parsed = parseArgs(['test', 'src/cart.test.ts', 'src/routes.test.ts'], '/app');

    expect(parsed.command).toBe('test');
    expect(parsed.files).toEqual(['src/cart.test.ts', 'src/routes.test.ts']);
    expect(parseArgs(['test'], '/app').files).toEqual([]);
  });

  it('parses --trials and --baseline without leaking their values into files', () => {
    const parsed = parseArgs(['eval', '--trials', '2', '--baseline', 'evals/baseline.json'], '/app');

    expect(parsed.trials).toBe(2);
    expect(parsed.baseline).toBe('evals/baseline.json');
    expect(parsed.files).toEqual([]);
  });

  it('defaults to a single trial and refuses a count that is not a whole number of runs', () => {
    expect(parseArgs(['eval'], '/app').trials).toBe(1);
    expect(() => parseArgs(['eval', '--trials', '0'], '/app')).toThrow(/--trials/);
    expect(() => parseArgs(['eval', '--trials', 'two'], '/app')).toThrow(/--trials/);
    expect(() => parseArgs(['eval', '--trials', '1.5'], '/app')).toThrow(/--trials/);
  });

  it('falls back to help on unknown commands', () => {
    expect(parseArgs(['nope'], '/app').command).toBe('help');
    expect(parseArgs([], '/app').command).toBe('help');
    expect(HELP_TEXT).toContain('janux dev');
    expect(HELP_TEXT).toContain('janux test');
    expect(HELP_TEXT).toContain('janux info');
  });

  it('rejects non-numeric ports', () => {
    expect(() => parseArgs(['dev', '--port', 'abc'], '/app')).toThrow(/--port/);
  });

  /**
   * A port the OS cannot bind is refused by the flag that named it. Left to the
   * runtime, `Bun.serve` and `server.listen` both fail from inside the server,
   * with a message about sockets rather than about what was typed.
   */
  it('rejects a port that is not a whole number', () => {
    expect(() => parseArgs(['dev', '--port', '3000.5'], '/app')).toThrow(/--port/);
    expect(() => parseArgs(['dev', '--port', 'Infinity'], '/app')).toThrow(/--port/);
  });

  it('rejects a port outside the TCP range', () => {
    expect(() => parseArgs(['dev', '--port', '-1'], '/app')).toThrow(/--port/);
    expect(() => parseArgs(['dev', '--port', '65536'], '/app')).toThrow(/--port/);
    expect(parseArgs(['dev', '--port', '65535'], '/app').port).toBe(65535);
  });

  /** How a platform tells a deployment which port to listen on. */
  it('falls back to PORT from the environment before the default', () => {
    const previous = process.env.PORT;

    process.env.PORT = '8080';
    try {
      expect(parseArgs(['start'], '/app').port).toBe(8080);
      // An explicit flag still wins over the environment.
      expect(parseArgs(['start', '--port', '4321'], '/app').port).toBe(4321);
    } finally {
      if (previous === undefined) delete process.env.PORT;
      else process.env.PORT = previous;
    }
  });
});

describe('tailwind auto-detection', () => {
  it('returns undefined when @janux/tailwind is not installed', async () => {
    const { loadTailwindPlugin } = await import('./commands');

    expect(await loadTailwindPlugin('/tmp/definitely-not-a-janux-app')).toBeUndefined();
  });
});
