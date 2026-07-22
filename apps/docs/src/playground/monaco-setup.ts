import { JANUX_DTS } from './janux-types';

/**
 * Shiki's real TSX TextMate grammar, registered under the id `typescript` so
 * Monaco tokenizes JSX properly WITHOUT losing the TS worker (IntelliSense
 * only attaches to typescript/javascript models).
 */
async function installTsxHighlighting(monaco: any): Promise<void> {
  const [{ shikiToMonaco }, { createHighlighterCore }, { createOnigurumaEngine }, tsxLangs] =
    await Promise.all([
      import('@shikijs/monaco'),
      import('shiki/core'),
      import('shiki/engine/oniguruma'),
      import('@shikijs/langs/tsx'),
    ]);
  const langs = tsxLangs.default.map((grammar: any) =>
    grammar.name === 'tsx' ? { ...grammar, name: 'typescript', aliases: [] } : grammar,
  );
  const highlighter = await createHighlighterCore({
    themes: [import('@shikijs/themes/github-light'), import('@shikijs/themes/github-dark')],
    langs,
    engine: createOnigurumaEngine(import('shiki/wasm')),
  });

  shikiToMonaco(highlighter, monaco);
}

const MONACO_THEMES = { light: 'github-light', dark: 'github-dark' } as const;

function currentTheme(): string {
  const forced = document.body.dataset.theme;
  const dark = forced ? forced === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;

  return dark ? MONACO_THEMES.dark : MONACO_THEMES.light;
}

/** Keeps Monaco in sync with the site theme (toggle island + OS preference). */
function followPageTheme(monaco: any, editor: any): void {
  const apply = () => monaco.editor.setTheme(currentTheme());
  const media = matchMedia('(prefers-color-scheme: dark)');
  const observer = new MutationObserver(apply);

  observer.observe(document.body, { attributeFilter: ['data-theme'] });
  media.addEventListener('change', apply);
  editor.onDidDispose(() => {
    observer.disconnect();
    media.removeEventListener('change', apply);
  });
}

export async function createEditor(host: HTMLElement, initial: string) {
  const monaco = await import('monaco-editor');
  const [{ default: EditorWorker }, { default: TsWorker }] = await Promise.all([
    import('monaco-editor/esm/vs/editor/editor.worker?worker'),
    import('monaco-editor/esm/vs/language/typescript/ts.worker?worker'),
  ]);

  (self as any).MonacoEnvironment = {
    getWorker: (_id: string, label: string) =>
      label === 'typescript' || label === 'javascript' ? new TsWorker() : new EditorWorker(),
  };
  configureTypescript(monaco);
  await installTsxHighlighting(monaco);
  const uri = monaco.Uri.parse('file:///playground.tsx');

  // A revisit (SPA navigation back to /playground) reuses Monaco's global model
  // registry — dispose any leftover model at this URI before recreating it.
  monaco.editor.getModel(uri)?.dispose();
  const model = monaco.editor.createModel(initial, 'typescript', uri);
  const editor = monaco.editor.create(host, {
    model,
    theme: currentTheme(),
    minimap: { enabled: false },
    fontSize: 13.5,
    automaticLayout: true,
    scrollBeyondLastLine: false,
    padding: { top: 12 },
  });

  followPageTheme(monaco, editor);

  return editor;
}

function configureTypescript(monaco: any): void {
  const ts = monaco.languages.typescript;

  ts.typescriptDefaults.setCompilerOptions({
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    jsx: ts.JsxEmit.ReactJSX,
    jsxImportSource: 'janux',
    allowNonTsExtensions: true,
    skipLibCheck: true,
  });
  ts.typescriptDefaults.setDiagnosticsOptions({ noSemanticValidation: false, noSyntaxValidation: false });
  ts.typescriptDefaults.addExtraLib(JANUX_DTS, 'file:///node_modules/janux/index.d.ts');
}
