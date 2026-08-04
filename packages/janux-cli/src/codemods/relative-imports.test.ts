import { describe, expect, it } from 'bun:test';
import { rebaseRelativeImports } from './relative-imports';

/** A stand-in move plan: everything under `app/` lands beside the routes, colocated files under `src/components`. */
const mapPath = (path: string) =>
  path.startsWith('app/') ? `src/components/${path.slice('app/'.length)}` : path;

const rebase = (code: string, from: string, to: string) => rebaseRelativeImports(code, { from, to, mapPath });

describe('rebaseRelativeImports', () => {
  it('leaves the file alone when it is not moving', () => {
    expect(rebase("import { a } from './a';\n", 'src/x.ts', 'src/x.ts')).toBeUndefined();
  });

  it('repoints a relative import at the same target, through the same move plan', () => {
    const code = "import { PostCard } from './PostCard';\n";

    expect(rebase(code, 'app/blog/page.tsx', 'src/routes/blog/index.tsx')).toBe(
      "import { PostCard } from '../../components/blog/PostCard';\n",
    );
  });

  it('walks a parent-relative specifier out of the moved tree and back to the same file', () => {
    const code = "import { db } from '../../../lib/db';\n";

    expect(rebase(code, 'app/blog/[slug]/page.tsx', 'src/routes/blog/[slug]/index.tsx')).toBe(
      "import { db } from '../../../../lib/db';\n",
    );
  });

  it('rewrites `export … from` and a dynamic import, not just static imports', () => {
    const code = "export { a } from './a';\nexport * from './b';\nconst c = import('./c');\n";

    expect(rebase(code, 'app/page.tsx', 'src/routes/index.tsx')).toBe(
      "export { a } from '../components/a';\nexport * from '../components/b';\nconst c = import('../components/c');\n",
    );
  });

  it('leaves package specifiers and app aliases alone', () => {
    const code = "import { a } from 'janux';\nimport { b } from '@/lib/b';\nimport { c } from './c';\n";

    expect(rebase(code, 'app/page.tsx', 'src/routes/index.tsx')).toBe(
      "import { a } from 'janux';\nimport { b } from '@/lib/b';\nimport { c } from '../components/c';\n",
    );
  });

  it('keeps the quote style the file already used', () => {
    expect(rebase('import { c } from "./c";\n', 'app/page.tsx', 'src/routes/index.tsx')).toBe(
      'import { c } from "../components/c";\n',
    );
  });

  it('answers nothing when no specifier has to change, so a second run is a no-op', () => {
    expect(rebase("import { a } from 'janux';\n", 'app/page.tsx', 'src/routes/index.tsx')).toBeUndefined();
  });
});
