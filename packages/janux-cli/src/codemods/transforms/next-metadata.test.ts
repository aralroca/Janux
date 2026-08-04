import { describe, expect, it } from 'bun:test';
import { nextMetadata } from './next-metadata';

const run = (code: string) => nextMetadata.run({ code, file: 'src/routes/index.tsx' });
const out = (code: string) => run(code).code;

describe('next/metadata', () => {
  it('renames the export Next reads to the one Janux reads', () => {
    expect(out('export const metadata = { title: "Blog" };\n')).toBe('export const meta = { title: "Blog" };\n');
  });

  it('retypes the annotation and repoints the type import', () => {
    const code = "import type { Metadata } from 'next';\n\nexport const metadata: Metadata = { title: 'Blog' };\n";

    expect(out(code)).toBe("import type { PageMeta } from 'janux';\n\nexport const meta: PageMeta = { title: 'Blog' };\n");
  });

  it('renames `openGraph` to `og`', () => {
    expect(out("export const metadata = { openGraph: { type: 'article' } };\n")).toBe(
      "export const meta = { og: { type: 'article' } };\n",
    );
  });

  it('collapses a single-image array to the one string `og`/`twitter` take', () => {
    const code = "export const metadata = { openGraph: { images: ['/og.png'] }, twitter: { images: ['/t.png'] } };\n";

    expect(out(code)).toBe("export const meta = { og: { image: '/og.png' }, twitter: { image: '/t.png' } };\n");
  });

  it('hoists `alternates.canonical` to the top-level `canonical`', () => {
    expect(out("export const metadata = { alternates: { canonical: '/blog' } };\n")).toBe(
      "export const meta = { canonical: '/blog' };\n",
    );
  });

  it('drops `metadataBase` and says where the base URL lives instead', () => {
    const result = run("export const metadata = { metadataBase: new URL('https://x.dev'), title: 'B' };\n");

    expect(result.code).toBe("export const meta = { title: 'B' };\n");
    expect(result.notes?.join(' ')).toMatch(/siteUrl/);
  });

  it('drops a trailing `metadataBase` without leaving a dangling comma', () => {
    expect(out("export const metadata = {\n  title: 'B',\n  metadataBase: new URL('https://x.dev'),\n};\n")).toBe(
      "export const meta = {\n  title: 'B',\n};\n",
    );
  });

  it('keeps a key Janux carries under the same name', () => {
    expect(out("export const metadata = { title: 'B', description: 'd', robots: { index: true } };\n")).toBe(
      "export const meta = { title: 'B', description: 'd', robots: { index: true } };\n",
    );
  });

  it('reports a key Janux has no field for, rather than dropping it silently', () => {
    const result = run("export const metadata = { keywords: ['a'], title: 'B' };\n");

    expect(result.code).toBe("export const meta = { keywords: ['a'], title: 'B' };\n");
    expect(result.notes?.join(' ')).toMatch(/keywords/);
  });

  it('renames `generateMetadata` and says how the signature differs', () => {
    const result = run('export async function generateMetadata({ params }) {\n  return { title: params.slug };\n}\n');

    expect(result.code).toBe('export async function meta({ params }) {\n  return { title: params.slug };\n}\n');
    expect(result.notes?.join(' ')).toMatch(/ctx/);
  });

  it('leaves a file with no Next metadata alone, so a second run is a no-op', () => {
    expect(run("export const meta = { title: 'B' };\n")).toEqual({});
  });

  it('is idempotent: running it over its own output changes nothing more', () => {
    const once = out("import type { Metadata } from 'next';\nexport const metadata: Metadata = { openGraph: { images: ['/o.png'] } };\n")!;

    expect(nextMetadata.run({ code: once, file: 'src/routes/index.tsx' }).code).toBeUndefined();
  });
});
