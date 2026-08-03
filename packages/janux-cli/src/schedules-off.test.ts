import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';
import { createJanuxServer } from '@janux/server';
import { prodServerOptions } from './prod';
import { verify } from './verify';
import { storage } from './__fixtures__/scheduled-app/src/schedules/_config';

/**
 * A command that does not serve traffic must not run the app's background jobs.
 *
 * `janux verify` runs in CI and `janux build` runs on a build machine, and both
 * build the same production wiring an actual server does. Mounting schedules
 * there means a check charges a card: the app's own store is production's, the
 * occurrence is genuinely due, and nothing about a build says "do not".
 */

const FIXTURE = join(import.meta.dirname, '__fixtures__/scheduled-app');
const markers: string[] = [];

function markerFile(): string {
  const path = join(mkdtempSync(join(tmpdir(), 'janux-schedule-marker-')), 'ran.log');

  markers.push(path);
  process.env.JANUX_SCHEDULE_MARKER = path;

  return path;
}

afterEach(() => {
  delete process.env.JANUX_SCHEDULE_MARKER;
  markers.splice(0).forEach((path) => rmSync(join(path, '..'), { recursive: true, force: true }));
});

describe('schedules and the commands that do not serve', () => {
  it('mounts them for a server, because that is the process that owns the loop', async () => {
    const options = await prodServerOptions(FIXTURE);

    expect(options.schedules).toMatchObject({ trigger: 'process' });
  });

  it('leaves them unmounted when the caller says it is not serving', async () => {
    const options = await prodServerOptions(FIXTURE, undefined, { schedules: false });

    expect(options.schedules).toBeUndefined();
    // Not merely unstarted: unmounted, so `_config.ts` never opens the
    // production database a build machine has no business connecting to.
    createJanuxServer(options);
  });

  it('janux verify checks the manifest without running a single job', async () => {
    const marker = markerFile();
    const exitCode = process.exitCode;

    // Genuinely due, the way it would be on a Monday morning build.
    await storage.syncSchedules([{ name: 'marker', cron: '* * * * *', nextRun: 1 }]);
    await verify({ command: 'verify', root: FIXTURE, port: 0, files: [], url: '', json: false });
    // The tick a mount would have started is fire-and-forget; give it room to
    // land, so this test fails for the right reason rather than by racing.
    await new Promise((resolve) => setTimeout(resolve, 50));
    process.exitCode = exitCode;

    expect(existsSync(marker)).toBe(false);
  });

  /** The control: without it, a handler that never writes would pass every test above. */
  it('a server built from the same app does run them, once one is due', async () => {
    const marker = markerFile();
    const options = await prodServerOptions(FIXTURE);

    await options.schedules!.mount.tick();
    await storage.syncSchedules([{ name: 'marker', cron: '* * * * *', nextRun: 1 }]);
    await options.schedules!.mount.tick();
    options.schedules!.mount.stop();

    expect(existsSync(marker)).toBe(true);
  });
});
