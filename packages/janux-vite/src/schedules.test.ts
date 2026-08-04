import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { scheduleFiles, scheduleName, scheduleServerOptions } from './schedules';
import { storage } from './__fixtures__/schedules-app/src/schedules/_config';
import { runs } from './__fixtures__/schedules-app/src/schedules/cleanup';

const APP = join(import.meta.dirname, '__fixtures__/schedules-app');
const DIR = join(APP, 'src/schedules');

describe('schedule discovery', () => {
  it('walks recursively, names by relative path, and skips underscores and non-modules', () => {
    expect(scheduleFiles(DIR).map((file) => scheduleName(DIR, file))).toEqual(['billing/invoice-sweep', 'cleanup']);
  });

  it('returns nothing for apps without the directory', () => {
    expect(scheduleFiles(undefined)).toEqual([]);
    expect(scheduleFiles(join(APP, 'src/none'))).toEqual([]);
  });

  /**
   * A `.d.ts` beside the schedules is ordinary, has no default export, and does
   * not start with `_` — treating it as a schedule fails the whole boot over a
   * file that declares types.
   */
  it('ignores type declarations', () => {
    expect(scheduleFiles(DIR).map((file) => scheduleName(DIR, file))).not.toContain('types.d');
  });
});

describe('scheduleServerOptions', () => {
  it('is undefined when the app has no schedules', async () => {
    expect(await scheduleServerOptions({ schedulesDir: undefined }, (file) => import(file))).toBeUndefined();
  });

  it('rejects a schedule file without a defineSchedule default export', async () => {
    expect(scheduleServerOptions({ schedulesDir: DIR }, async () => ({}))).rejects.toThrow(
      'must default-export defineSchedule',
    );
  });

  it('mounts the discovered schedules on the storage `_config.ts` chose', async () => {
    const options = await scheduleServerOptions({ schedulesDir: DIR }, (file) => import(file), 'http');

    expect(options?.trigger).toBe('http');
    // A pending occurrence from a previous life of the app, on the config's own
    // store: the mount must pick it up under its path-derived name.
    await storage.syncSchedules([
      { name: 'cleanup', cron: '0 3 * * *', nextRun: 1 },
      { name: 'billing/invoice-sweep', cron: '@daily', nextRun: Date.now() + 86_400_000 },
    ]);

    expect(await options!.mount.tick()).toEqual(['cleanup']);
    expect(runs).toHaveLength(1);
  });
});
