import { describe, expect, it } from 'bun:test';
import { astroContent } from './astro-content';

const run = (code: string) => astroContent.run({ code, file: 'src/content/config.ts' });
const out = (code: string) => run(code).code;

describe('astro/content', () => {
  it('repoints `astro:content` at the Janux package that took the same API', () => {
    expect(out("import { defineCollection } from 'astro:content';\n")).toBe(
      "import { defineCollection } from '@janux/content';\n",
    );
  });

  it('drops `z` from the import and brings in the builders it was replaced by', () => {
    const code = "import { defineCollection, z } from 'astro:content';\n\nconst blog = defineCollection({ schema: z.object({ title: z.string() }) });\n";

    expect(out(code)).toBe(
      "import { defineCollection } from '@janux/content';\nimport { schema, str } from 'janux';\n\nconst blog = defineCollection({ schema: schema({ title: str() }) });\n",
    );
  });

  it('translates every builder it has an equivalent for', () => {
    const code =
      "import { z } from 'astro:content';\nconst a = z.object({ s: z.string(), n: z.number(), b: z.boolean(), l: z.array(z.string()), e: z.enum(['x']) });\n";

    expect(out(code)).toBe(
      "import { bool, enums, list, num, obj, str } from 'janux';\nconst a = obj({ s: str(), n: num(), b: bool(), l: list(str()), e: enums(['x']) });\n",
    );
  });

  it('leaves the chained modifiers alone, because Janux spells them the same', () => {
    const code = "import { z } from 'astro:content';\nconst a = z.object({ t: z.string().optional(), d: z.string().default('x') });\n";

    expect(out(code)).toBe(
      "import { obj, str } from 'janux';\nconst a = obj({ t: str().optional(), d: str().default('x') });\n",
    );
  });

  it('reports a builder Janux has no equivalent for, instead of translating it wrongly', () => {
    const result = run("import { z } from 'astro:content';\nconst a = z.object({ when: z.date() });\n");

    expect(result.notes?.join(' ')).toMatch(/z\.date/);
  });

  it('leaves a file with no Astro content imports alone, so a second run is a no-op', () => {
    expect(run("import { getCollection } from '@janux/content';\n")).toEqual({});
  });

  it('is idempotent over its own output', () => {
    const once = out("import { defineCollection, z } from 'astro:content';\nconst a = defineCollection({ schema: z.object({ t: z.string() }) });\n")!;

    expect(astroContent.run({ code: once, file: 'src/content/config.ts' }).code).toBeUndefined();
  });
});
