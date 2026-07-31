import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { capabilities as vercelCapabilities } from '@janux/vercel';
import { capabilities as nodeCapabilities } from '@janux/node';
import { createRequestHandler, staticResponse, unsupportedFeatures } from '@janux/cli/adapter';

/**
 * recipes/adapters.md is the page that has to be right without anyone reading
 * our source — that is the whole point of it. So every claim it makes about the
 * interface is checked against the interface, and the capability matrix in
 * recipes/deploying.md is checked against what the adapters actually declare.
 */

const CONTENT = join(import.meta.dir, '../../../apps/docs/content/recipes');
const ADAPTERS = readFileSync(join(CONTENT, 'adapters.md'), 'utf8');
const DEPLOYING = readFileSync(join(CONTENT, 'deploying.md'), 'utf8');

describe('recipes/adapters.md — the API it documents is the API that exists', () => {
  it('names the two entry points a third party imports', () => {
    expect(ADAPTERS).toContain("from '@janux/cli/adapter'");
    expect(ADAPTERS).toContain("from '@janux/cli/adapter/build'");
    expect(typeof createRequestHandler).toBe('function');
    expect(typeof staticResponse).toBe('function');
    expect(typeof unsupportedFeatures).toBe('function');
  });

  /**
   * A builder method the page promises but does not exist is the failure this
   * page can least afford — and so is one that exists and goes undocumented,
   * since the page claims to be sufficient on its own.
   */
  it('documents every method the builder actually hands an adapter, and no others', () => {
    const documented = ['writeEntry', 'bundle', 'copyClient', 'copyDir', 'write', 'log'];
    const source = readFileSync(join(import.meta.dir, '../../janux-cli/src/adapter.ts'), 'utf8');
    const body = /export interface AdapterBuilder \{([\s\S]*?)\n\}/.exec(source)?.[1] ?? '';
    const declared = [...body.matchAll(/^ {2}(\w+)\(/gm)].map((match) => match[1]!);

    documented.forEach((method) => expect(ADAPTERS).toContain(method));
    expect(declared).toEqual(documented);
  });

  it('lists the three capability flags, all of them', () => {
    Object.keys(nodeCapabilities).forEach((flag) => expect(ADAPTERS).toContain(flag));
  });

  it('warns that the client must live at dist/client inside the deployment root', () => {
    // The bug it describes renders perfect HTML and never hydrates, so the page
    // has to say it out loud.
    expect(ADAPTERS).toContain('dist/client/client.js');
    expect(ADAPTERS).toContain('never hydrates');
  });
});

describe('recipes/adapters.md — the worked Deno adapter is a valid JanuxAdapter', () => {
  /** The page's headline example. If it does not typecheck as one, the page is fiction. */
  it('has the shape the interface requires', () => {
    const snippet = /export function deno\(\): JanuxAdapter \{[\s\S]*?\n\}/.exec(ADAPTERS)?.[0] ?? '';

    expect(snippet).toContain('name:');
    expect(snippet).toContain('capabilities:');
    expect(snippet).toContain('async adapt(builder)');
    // The two details the page calls load-bearing.
    expect(snippet).toContain('copyDir');
    expect(snippet).toContain('dist/client');
  });
});

describe('recipes/deploying.md — the matrix matches what the adapters declare', () => {
  /** A row that flatters a target is worse than no row: it is a promise production breaks. */
  it('says Node supports WebSockets, because @janux/node declares it', () => {
    expect(nodeCapabilities).toEqual({ websocket: true, streaming: true, filesystem: true });
    expect(DEPLOYING).toMatch(/\*\*Node 24\+\*\*.*`@janux\/node`.*✅.*✅.*✅/);
  });

  it('says Vercel does not, because a serverless invocation cannot hold one open', () => {
    expect(vercelCapabilities.websocket).toBe(false);
    expect(DEPLOYING).toMatch(/\*\*Vercel\*\*.*❌ serverless/);
  });

  it('no longer claims production means Bun', () => {
    expect(DEPLOYING).not.toContain('No server bundle, no Node');
    expect(DEPLOYING).toContain('Node 24+');
  });

  it('points at the adapter page for the targets Janux does not ship', () => {
    expect(DEPLOYING).toContain('/docs/recipes/adapters');
    expect(DEPLOYING).toContain('*not shipped*');
  });
});

describe('recipes/deploying.md — the Node layout it prints is the one the adapter writes', () => {
  it('names the files @janux/node actually produces', () => {
    const adapter = readFileSync(join(import.meta.dir, '../../janux-node/src/index.ts'), 'utf8');

    ['build/index.js', 'build/.janux/index.js', 'build/dist/client/', 'build/src/'].forEach((path) =>
      expect(DEPLOYING).toContain(path),
    );
    expect(adapter).toContain("`${BUILD_DIR}/dist/client`");
    expect(adapter).toContain('{"type":"module"}');
  });

  it('documents the --include flag the bin accepts', () => {
    const bin = readFileSync(join(import.meta.dir, '../../janux-node/bin.ts'), 'utf8');

    expect(DEPLOYING).toContain('--include content');
    expect(bin).toContain("'--include'");
  });
});
