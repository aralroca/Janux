import { describe, expect, it } from 'bun:test';
import { nextImports } from './next-imports';

const run = (code: string) => nextImports.run({ code, file: 'src/routes/index.tsx' });
const out = (code: string) => run(code).code;

describe('next/imports', () => {
  it('repoints `next/image` at the Janux `Image`', () => {
    expect(out("import Image from 'next/image';\n")).toBe("import { Image } from 'janux';\n");
  });

  it('keeps the local name when the default import was renamed', () => {
    expect(out("import NextImage from 'next/image';\n")).toBe("import { Image as NextImage } from 'janux';\n");
  });

  it('drops `next/link`, because a Janux link is an `<a>`', () => {
    const result = run("import Link from 'next/link';\nimport { a } from './a';\n");

    expect(result.code).toBe("import { a } from './a';\n");
    expect(result.notes?.join(' ')).toMatch(/<a>/);
  });

  it('maps the `next/navigation` names Janux has, and reports the ones it does not', () => {
    const result = run("import { notFound, useRouter } from 'next/navigation';\n");

    expect(result.code).toBe("import { notFound } from 'janux';\n");
    expect(result.notes?.join(' ')).toMatch(/useRouter/);
  });

  it('drops `next/server`, because a handler answers with a plain `Response`', () => {
    const result = run("import { NextResponse } from 'next/server';\n\nexport function GET() {\n  return NextResponse.json({});\n}\n");

    expect(result.code).toBe("\nexport function GET() {\n  return NextResponse.json({});\n}\n");
    expect(result.notes?.join(' ')).toMatch(/NextResponse/);
  });

  it('reports `next/head`, whose job belongs to the page `meta` export', () => {
    expect(run("import Head from 'next/head';\n").notes?.join(' ')).toMatch(/meta/);
  });

  it('reports a `next/*` module it has no mapping for at all', () => {
    expect(run("import { unstable_cache } from 'next/cache';\n").notes?.join(' ')).toMatch(/next\/cache/);
  });

  it('leaves a file with no Next imports alone, so a second run is a no-op', () => {
    expect(run("import { component } from 'janux';\n")).toEqual({});
  });

  it('is idempotent over its own output', () => {
    const once = out("import Image from 'next/image';\nimport Link from 'next/link';\n")!;

    expect(nextImports.run({ code: once, file: 'src/routes/index.tsx' }).code).toBeUndefined();
  });
});
