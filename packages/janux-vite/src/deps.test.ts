import { describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runtimeIncludes } from './deps';

/**
 * Regression: "Ask AI" in the docs answered `Local model unavailable (Failed to
 * fetch dynamically imported module .../deps/@browser-ai_transformers-js.js?v=…)`.
 * `janux` and `@janux/agent` are excluded from pre-bundling, and Vite never looks
 * inside an excluded package: `@aralroca/gui-agent/ui` — a static import of the
 * copilot since the visualizer landed — was met for the first time when the
 * copilot module was requested, mid-session. That discovery re-optimizes, every
 * optimized dep gets a fresh hash, and the local model's dynamic import (already
 * in flight, old hash) 504s. Apps can't be asked to enumerate the framework's own
 * browser deps: the plugin pre-bundles them.
 */
const FRAMEWORK_BROWSER_SOURCES = ['janux/src/client', 'janux-agent/src/local'];
const BARE_IMPORT = /(?:from|import)\s*\(?\s*['"]([^.'"][^'"]*)['"]/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) return sourceFiles(path);

    return /\.tsx?$/.test(entry.name) && !entry.name.includes('.test.') ? [path] : [];
  });
}

/** Every package the framework's browser runtime imports — `janux`/`@janux/*` is itself, `node:*` the runtime. */
function frameworkBrowserImports(): string[] {
  const code = FRAMEWORK_BROWSER_SOURCES.flatMap((dir) => sourceFiles(resolve(import.meta.dir, '../..', dir)))
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
  const specifiers = [...code.matchAll(BARE_IMPORT)].map(([, specifier]) => specifier);

  return [...new Set(specifiers)].filter((specifier) => !/^(node:|janux$|janux\/|@janux\/)/.test(specifier));
}

/** An app root that installed `@janux/agent` and its gui-agent dep — and no optional peer. */
function appWithGuiAgentOnly(): string {
  const root = mkdtempSync(join(tmpdir(), 'janux-stub-app-'));
  const stubs = ['@janux/agent', '@janux/agent/node_modules/@aralroca/gui-agent'];

  stubs.forEach((pkg) => {
    const dir = join(root, 'node_modules', pkg);

    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), '{}');
  });

  return root;
}

describe('runtimeIncludes', () => {
  const docs = resolve(import.meta.dir, '../../../apps/docs');

  it('pre-bundles the copilot deps Vite cannot see behind the excluded packages', () => {
    expect(runtimeIncludes(docs)).toContain('@janux/agent > @aralroca/gui-agent/ui');
    expect(runtimeIncludes(docs)).toContain('@janux/agent > @browser-ai/transformers-js');
  });

  /** Between the copilot app and the React-islands app, every import is installed somewhere. */
  it('covers every bare import of the framework browser runtime', () => {
    const withReact = resolve(import.meta.dir, '../../../examples/interop-react');
    const covered = [...runtimeIncludes(docs), ...runtimeIncludes(withReact)].map((entry) =>
      entry.split(' > ').at(-1),
    );

    expect(frameworkBrowserImports().filter((specifier) => !covered.includes(specifier))).toEqual([]);
  });

  it('leaves out an optional peer the app never installed', () => {
    expect(runtimeIncludes(appWithGuiAgentOnly())).toEqual([
      '@janux/agent > @aralroca/gui-agent',
      '@janux/agent > @aralroca/gui-agent/ai-sdk',
      '@janux/agent > @aralroca/gui-agent/ui',
    ]);
  });

  it('is empty where the framework itself does not resolve', () => {
    expect(runtimeIncludes(mkdtempSync(join(tmpdir(), 'janux-bare-')))).toEqual([]);
  });
});
