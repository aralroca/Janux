import { afterAll, afterEach, beforeAll, describe, expect } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { schema, str } from 'janux';
import { defineCollection, getCollection } from '../../janux-content/src/collection';
import { runCases } from '../support/scenario';
import { APP_ROOT_CASES } from './content-app-root.cases';

const ROOT = join(import.meta.dir, '.tmp-app-root');
const APPS = { appA: join(ROOT, 'appA'), appB: join(ROOT, 'appB') };
const POST = schema({ title: str() });
const previous = process.env.JANUX_APP_ROOT;

beforeAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
  Object.entries(APPS).forEach(([name, dir]) => {
    mkdirSync(join(dir, 'content'), { recursive: true });
    writeFileSync(join(dir, 'content/post.md'), `---\ntitle: From ${name.slice(-1)}\n---\nBody\n`);
  });
});

afterEach(() => {
  if (previous === undefined) delete process.env.JANUX_APP_ROOT;
  else process.env.JANUX_APP_ROOT = previous;
});

afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

function publish(root: 'appA' | 'appB' | null): void {
  if (root === null) delete process.env.JANUX_APP_ROOT;
  else process.env.JANUX_APP_ROOT = APPS[root];
}

describe('collection app-root scoping', () =>
  runCases(APP_ROOT_CASES, (row) => {
    publish(row.rootAtDeclaration);
    const collection = defineCollection({
      dir: row.dir === 'relative' ? 'content' : join(APPS.appA, 'content'),
      schema: POST,
    });

    // Another app publishes its own root before this collection is ever read.
    publish(row.rootAtRead);

    expect(getCollection(collection).map((entry) => entry.data.title)).toEqual(row.expected);
  }));
