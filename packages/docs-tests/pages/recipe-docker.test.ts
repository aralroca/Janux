import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from '@janux/cli';

/**
 * recipes/docker.md is verified by building and running the image (see the
 * commit), which CI can't do. What CI *can* do is keep the page honest about
 * the app it describes: the Dockerfile only runs scripts the scaffold defines,
 * `--production` is only safe while the framework packages are runtime deps,
 * and the env vars it lists must be the ones the code reads.
 */

const ROOT = resolve(import.meta.dir, '../../..');
const PAGE = readFileSync(join(ROOT, 'apps/docs/content/recipes/docker.md'), 'utf8');
const TEMPLATE = JSON.parse(readFileSync(join(ROOT, 'packages/create-janux/template/package.json'), 'utf8'));
const dockerfile = /```dockerfile\n([\s\S]*?)```/.exec(PAGE)![1]!;

describe('recipes/docker.md', () => {
  it('only runs scripts the scaffolded app actually defines', () => {
    // Both forms appear: `RUN bun run build` and `CMD ["bun", "run", "start"]`.
    const scripts = [...dockerfile.matchAll(/bun"?,?\s*"?run"?,?\s*"?(\w+)/g)].map((match) => match[1]!);

    expect(scripts).toEqual(['build', 'start']);
    scripts.forEach((script) => expect(TEMPLATE.scripts).toHaveProperty(script));
  });

  it("the '--production is safe' claim holds: the framework packages are runtime deps", () => {
    expect(Object.keys(TEMPLATE.dependencies).sort()).toEqual(['@janux/cli', '@janux/server', 'janux']);
    expect(Object.keys(TEMPLATE.devDependencies ?? {})).not.toContain('@janux/cli');
  });

  it('copies the lockfile with a glob, so a scaffold without one still builds', () => {
    expect(dockerfile).toContain('COPY package.json bun.lock* ./');
  });

  it('names env vars the code really reads', () => {
    const model = readFileSync(join(ROOT, 'packages/janux-agent/src/model.ts'), 'utf8');
    const claimed = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'JANUX_MODEL'];

    claimed.forEach((name) => {
      expect(PAGE).toContain(name);
      expect(model).toContain(name);
    });
  });

  it('PORT drives the server the way the page says', () => {
    const previous = process.env.PORT;

    process.env.PORT = '4000';
    try {
      expect(parseArgs(['start'], '/app').port).toBe(4000);
    } finally {
      if (previous === undefined) delete process.env.PORT;
      else process.env.PORT = previous;
    }

    expect(parseArgs(['start'], '/app').port).toBe(3000);
    expect(parseArgs(['start', '--port', '8080'], '/app').port).toBe(8080);
  });

  it('the healthcheck uses bun, because the slim image ships no curl', () => {
    const healthcheck = /HEALTHCHECK[\s\S]*?```/.exec(PAGE)![0];

    expect(healthcheck).toContain('bun -e');
    expect(healthcheck).not.toContain('curl');
  });
});
