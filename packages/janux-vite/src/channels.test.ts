import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { channelFiles, channelName, channelServerOptions } from './channels';

const APP = join(import.meta.dirname, '__fixtures__/channels-app');
const DIR = join(APP, 'src/channels');

/**
 * Channels are discovered the way routes, skills and schedules are: the
 * filesystem is the declaration. Nothing about a channel is registered twice.
 */

describe('channel discovery', () => {
  it('walks recursively, names by relative path, and skips underscores and non-modules', () => {
    expect(channelFiles(DIR).map((file) => channelName(DIR, file))).toEqual(['ops/inbox', 'webhook']);
  });

  it('returns nothing for apps without the directory', () => {
    expect(channelFiles(undefined)).toEqual([]);
    expect(channelFiles(join(APP, 'src/none'))).toEqual([]);
  });

  it('ignores type declarations, which have no default export and no underscore to hide behind', () => {
    expect(channelFiles(DIR).map((file) => channelName(DIR, file))).not.toContain('types.d');
  });
});

describe('channelServerOptions', () => {
  it('is undefined when the app declares no channels', async () => {
    expect(await channelServerOptions({ channelsDir: undefined }, (file) => import(file))).toBeUndefined();
  });

  it('rejects a file that does not default-export defineChannel', async () => {
    expect(channelServerOptions({ channelsDir: DIR }, async () => ({}))).rejects.toThrow('must default-export defineChannel');
  });

  it('mounts every discovered channel under its own name', async () => {
    const channels = await channelServerOptions({ channelsDir: DIR }, (file) => import(file));

    expect(Object.keys(channels!).sort()).toEqual(['ops/inbox', 'webhook']);
    const received = await channels!.webhook!.receive(
      new Request('http://test/_janux/channels/webhook', { method: 'POST', body: JSON.stringify({ text: 'hi' }) }),
    );

    expect(received).toEqual({ text: 'hi' });
  });
});
