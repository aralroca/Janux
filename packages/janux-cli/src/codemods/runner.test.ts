import { describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { codemodById } from './registry';
import { applyPlan, planCodemods, renderPlan, sourceFiles } from './runner';

function app(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'janux-codemod-'));

  for (const [path, code] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), code);
  }

  return root;
}

const events = codemodById('0.5.0/events-by-name')!;
const routes = codemodById('next/routes')!;

describe('sourceFiles', () => {
  it('walks the app and answers app-relative, forward-slashed paths', () => {
    const root = app({ 'src/a.tsx': '', 'src/deep/b.ts': '' });

    expect(sourceFiles(root).sort()).toEqual(['src/a.tsx', 'src/deep/b.ts']);
  });

  /** A directory can be named like a source file; handing one to `readFileSync` takes the command down. */
  it('answers files only, not a directory whose name looks like one', () => {
    const root = app({ 'src/a.tsx': '', 'src/Widget.tsx/index.ts': '' });

    expect(sourceFiles(root).sort()).toEqual(['src/Widget.tsx/index.ts', 'src/a.tsx']);
  });

  it('never descends into build output or dependencies', () => {
    const root = app({ 'src/a.tsx': '', 'node_modules/x/i.ts': '', 'dist/b.js': '', '.next/c.ts': '' });

    expect(sourceFiles(root)).toEqual(['src/a.tsx']);
  });
});

describe('planCodemods', () => {
  it('reports the edit a codemod would make, without touching the file', () => {
    const root = app({ 'src/W.tsx': 'const a = <button on={intents.add} />;\n' });
    const plan = planCodemods([events], root);

    expect(plan).toHaveLength(1);
    expect(plan[0]!.after).toBe('const a = <button onClick={intents.add} />;\n');
    expect(readFileSync(join(root, 'src/W.tsx'), 'utf8')).toBe('const a = <button on={intents.add} />;\n');
  });

  it('leaves a file nothing changed out of the plan entirely', () => {
    const root = app({ 'src/W.tsx': 'const a = <button onClick={intents.add} />;\n' });

    expect(planCodemods([events], root)).toEqual([]);
  });

  it('threads one codemod into the next, so the second sees the first one output', () => {
    const root = app({ 'app/page.tsx': "import Image from 'next/image';\nconst a = <button on={intents.x} />;\n" });
    const plan = planCodemods([routes, codemodById('next/imports')!, events], root);

    expect(plan[0]!.moveTo).toBe('src/routes/index.tsx');
    expect(plan[0]!.after).toContain("import { Image } from 'janux';");
    expect(plan[0]!.after).toContain('onClick={intents.x}');
  });

  it('carries the notes a codemod left, so a dry run reports the manual work too', () => {
    const root = app({ 'app/loading.tsx': 'export default function L() {}\n' });

    expect(planCodemods([routes], root)[0]!.notes.join(' ')).toMatch(/suspense/i);
  });

  it('is idempotent: a plan over the applied result is empty', () => {
    const root = app({ 'src/W.tsx': 'const a = <button on={intents.add} />;\n' });

    applyPlan(planCodemods([events], root), root);
    expect(planCodemods([events], root)).toEqual([]);
  });
});

describe('renderPlan', () => {
  it('prints a diff for an edited file', () => {
    const root = app({ 'src/W.tsx': 'const a = <button on={intents.add} />;\n' });

    expect(renderPlan(planCodemods([events], root))).toContain('-const a = <button on={intents.add} />;');
  });

  it('prints a move as a move, since a renamed file has no diff to show', () => {
    const root = app({ 'app/page.tsx': 'export default function P() {}\n' });

    expect(renderPlan(planCodemods([routes], root))).toContain('app/page.tsx → src/routes/index.tsx');
  });

  it('prints the notes under the file they belong to', () => {
    const root = app({ 'app/loading.tsx': 'export default function L() {}\n' });

    expect(renderPlan(planCodemods([routes], root))).toContain('app/loading.tsx');
  });
});

describe('applyPlan', () => {
  it('writes the edit', () => {
    const root = app({ 'src/W.tsx': 'const a = <button on={intents.add} />;\n' });

    applyPlan(planCodemods([events], root), root);
    expect(readFileSync(join(root, 'src/W.tsx'), 'utf8')).toBe('const a = <button onClick={intents.add} />;\n');
  });

  it('moves the file, creating the directory and leaving nothing behind', () => {
    const root = app({ 'app/blog/page.tsx': 'export default function P() {}\n' });

    applyPlan(planCodemods([routes], root), root);
    expect(existsSync(join(root, 'app/blog/page.tsx'))).toBe(false);
    expect(readFileSync(join(root, 'src/routes/blog/index.tsx'), 'utf8')).toBe('export default function P() {}\n');
  });

  /**
   * A half-migrated tree is the normal state of a migration, so a move whose
   * destination already exists is reachable — and overwriting is the one
   * outcome a `--dry-run` could not have warned about.
   */
  it('refuses to overwrite a file already sitting at the destination', () => {
    const root = app({ 'app/page.tsx': 'export default function P() {}\n', 'src/routes/index.tsx': 'export default function Q() {}\n' });

    expect(() => applyPlan(planCodemods([routes], root), root)).toThrow(/src\/routes\/index\.tsx/);
    expect(readFileSync(join(root, 'src/routes/index.tsx'), 'utf8')).toBe('export default function Q() {}\n');
  });

  it('answers how many files it touched', () => {
    const root = app({ 'src/W.tsx': 'const a = <button on={intents.add} />;\n', 'src/X.tsx': 'const b = 1;\n' });

    expect(applyPlan(planCodemods([events], root), root)).toBe(1);
  });
});
