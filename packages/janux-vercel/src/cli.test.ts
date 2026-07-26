import { describe, expect, it } from 'bun:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseVercelArgs, runVercelInit, vercelFiles } from './cli';

describe('parseVercelArgs', () => {
  it('collects every --include and reads --max-duration', () => {
    expect(parseVercelArgs(['--include', 'content', '--include', 'data', '--max-duration', '60'])).toEqual({
      include: ['content', 'data'],
      maxDuration: 60,
    });
  });

  it('ignores a --max-duration that is not a number', () => {
    expect(parseVercelArgs(['--max-duration', 'soon']).maxDuration).toBeUndefined();
    expect(parseVercelArgs([])).toEqual({ include: [], maxDuration: undefined });
  });
});

describe('vercelFiles', () => {
  it('writes the function entry only for a server app', () => {
    expect(Object.keys(vercelFiles({ output: 'bun' }))).toEqual(['vercel.json', 'api/index.ts']);
    expect(Object.keys(vercelFiles({ output: 'static' }))).toEqual(['vercel.json']);
  });

  it('emits vercel.json as formatted JSON ending in a newline', () => {
    const json = vercelFiles({ output: 'static' })['vercel.json']!;

    expect(json.endsWith('\n')).toBe(true);
    expect(JSON.parse(json).$schema).toBe('https://openapi.vercel.sh/vercel.json');
  });
});

describe('runVercelInit', () => {
  it('reads the app\'s output mode and writes what that mode needs', async () => {
    const root = mkdtempSync(join(tmpdir(), 'janux-vercel-'));

    await Bun.write(join(root, 'janux.config.ts'), 'export default { output: "static" };\n');
    await runVercelInit([], root);

    expect(JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf-8')).cleanUrls).toBe(true);
    expect(await Bun.file(join(root, 'api/index.ts')).exists()).toBe(false);
  });

  it('defaults to a server app, function entry included', async () => {
    const root = mkdtempSync(join(tmpdir(), 'janux-vercel-'));

    await runVercelInit(['--include', 'content'], root);
    const config = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf-8'));

    expect(config.bunVersion).toBe('1.x');
    expect(config.functions['api/index.ts'].includeFiles).toBe('{src,dist,content}/**');
    expect(readFileSync(join(root, 'api/index.ts'), 'utf-8')).toContain('@janux/vercel');
  });
});
