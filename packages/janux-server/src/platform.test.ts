import { describe, expect, it } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bunPlatform, nodePlatform, platform, type JanuxPlatform } from './platform';

/**
 * The two implementations are held to one test body: whatever the production
 * path asks of the runtime, both runtimes must answer identically. A divergence
 * here is a Node deployment behaving differently from a Bun one, which is the
 * whole failure mode the adapter API exists to prevent.
 */

async function scratch(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'janux-platform-'));
}

const IMPLEMENTATIONS: [string, JanuxPlatform][] = [
  ['bun', bunPlatform],
  ['node', nodePlatform],
];

describe.each(IMPLEMENTATIONS)('platform: %s', (_name, impl) => {
  it('spools a file through the sink: write, flush, end', async () => {
    const dir = await scratch();
    const path = join(dir, 'spooled.bin');
    const sink = impl.fileSink(path);

    await sink.write(new TextEncoder().encode('hello '));
    await sink.flush();
    await sink.write(new TextEncoder().encode('world'));
    await sink.end();

    expect(await readFile(path, 'utf8')).toBe('hello world');
    await rm(dir, { recursive: true, force: true });
  });

  it('writes chunks larger than one syscall without losing bytes', async () => {
    const dir = await scratch();
    const path = join(dir, 'big.bin');
    const chunk = new Uint8Array(512 * 1024).fill(7);
    const sink = impl.fileSink(path);

    await sink.write(chunk);
    await sink.write(chunk);
    await sink.end();

    expect((await impl.openFile(path))?.size).toBe(chunk.byteLength * 2);
    await rm(dir, { recursive: true, force: true });
  });

  it('opens a file and reports its size', async () => {
    const dir = await scratch();
    const path = join(dir, 'sized.txt');

    await writeFile(path, 'abcde');

    expect((await impl.openFile(path))?.size).toBe(5);
    await rm(dir, { recursive: true, force: true });
  });

  it('refuses to open what is not a readable file', async () => {
    const dir = await scratch();

    expect(await impl.openFile(join(dir, 'missing.txt'))).toBeUndefined();
    // A directory is not a file the static handler may serve.
    expect(await impl.openFile(dir)).toBeUndefined();
    await rm(dir, { recursive: true, force: true });
  });

  it('reads the whole file as bytes, binary-safe', async () => {
    const dir = await scratch();
    const path = join(dir, 'bytes.bin');

    await writeFile(path, new Uint8Array([0, 1, 2, 253, 254, 255]));
    const file = await impl.openFile(path);

    expect([...(await file!.bytes())]).toEqual([0, 1, 2, 253, 254, 255]);
    await rm(dir, { recursive: true, force: true });
  });

  it('hands back a body a Response can stream from disk', async () => {
    const dir = await scratch();
    const path = join(dir, 'body.txt');

    await writeFile(path, 'streamed from disk');
    const file = await impl.openFile(path);

    expect(await new Response(file!.stream()).text()).toBe('streamed from disk');
    await rm(dir, { recursive: true, force: true });
  });

  it('streams a fresh body per response, so two responses both get the bytes', async () => {
    const dir = await scratch();
    const path = join(dir, 'twice.txt');

    await writeFile(path, 'read me twice');
    const file = await impl.openFile(path);
    const bodies = await Promise.all([new Response(file!.stream()).text(), new Response(file!.stream()).text()]);

    expect(bodies).toEqual(['read me twice', 'read me twice']);
    await rm(dir, { recursive: true, force: true });
  });
});

describe('the detected platform', () => {
  it('is the Bun one when the suite runs under Bun', () => {
    expect(platform.name).toBe('bun');
    expect(platform).toBe(bunPlatform);
  });
});
