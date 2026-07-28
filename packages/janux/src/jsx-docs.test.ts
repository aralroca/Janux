import { describe, expect, it } from 'bun:test';
import ts from 'typescript';
import { join } from 'node:path';

/**
 * Hover-docs contract: the JSX attribute surface must carry JSDoc, so an
 * editor hover explains `dangerHTML` or `style` instead of showing a bare
 * type. This drives the real TypeScript language service over a fixture and
 * reads the same quick info VS Code would show.
 */
const FIXTURE_PATH = join(import.meta.dir, '__hover_fixture__.tsx');
const FIXTURE = `export const view = <div style={{ color: 'red' }} dangerHTML="<b>hi</b>" />;\n`;

/**
 * The package's real compiler options, so the hover this test reads is the
 * hover the editor shows. Only `lib` is pinned: the default full ESNext lib
 * set triples the test's cost without changing either assertion.
 */
function projectOptions(): ts.CompilerOptions {
  const configPath = join(import.meta.dir, '..', 'tsconfig.json');
  const config = ts.getParsedCommandLineOfConfigFile(
    configPath,
    { lib: ['lib.es2023.d.ts', 'lib.dom.d.ts'] },
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
      },
    },
  );

  return config!.options;
}

const OPTIONS = projectOptions();

const HOST: ts.LanguageServiceHost = {
  getScriptFileNames: () => [FIXTURE_PATH],
  getScriptVersion: () => '1',
  getScriptSnapshot: (file) => {
    const text = file === FIXTURE_PATH ? FIXTURE : ts.sys.readFile(file);

    return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
  },
  getCurrentDirectory: () => import.meta.dir,
  getCompilationSettings: () => OPTIONS,
  getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
  fileExists: (file) => file === FIXTURE_PATH || ts.sys.fileExists(file),
  readFile: (file) => (file === FIXTURE_PATH ? FIXTURE : ts.sys.readFile(file)),
  readDirectory: ts.sys.readDirectory,
  directoryExists: ts.sys.directoryExists,
  getDirectories: ts.sys.getDirectories,
};

const service = ts.createLanguageService(HOST, ts.createDocumentRegistry());

function hoverAt(marker: string): { type: string; docs: string } {
  const info = service.getQuickInfoAtPosition(FIXTURE_PATH, FIXTURE.indexOf(marker));

  if (!info) throw new Error(`no quick info at "${marker}"`);

  return {
    type: ts.displayPartsToString(info.displayParts),
    docs: ts.displayPartsToString(info.documentation),
  };
}

describe('JSX attribute hover docs', () => {
  it('documents dangerHTML with its security warning', () => {
    const { type, docs } = hoverAt('dangerHTML');

    expect(type).toContain('dangerHTML');
    expect(docs).toContain('raw HTML');
    expect(docs).toContain('XSS');
  });

  it('documents style and types it as string | CSSProperties', () => {
    const { type, docs } = hoverAt('style');

    expect(type).toContain('CSSProperties');
    expect(docs).toContain('never given a unit');
  });
});
