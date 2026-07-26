import { JANUX_DTS } from './janux-types';
import { withContrastFixes } from '../theme-contrast';

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
  const [light, dark] = await Promise.all([
    import('@shikijs/themes/github-light'),
    import('@shikijs/themes/github-dark'),
  ]);
  const highlighter = await createHighlighterCore({
    themes: [withContrastFixes(light.default as any, 'github-light'), withContrastFixes(dark.default as any, 'github-dark')],
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
  /*
   * The editor and the one language service this page uses, not the
   * `monaco-editor` barrel: that ships every language Monaco knows (80-odd
   * grammars) plus the CSS, HTML and JSON services, none of which this editor
   * can reach — highlighting here is shiki's TSX grammar and the only model is
   * `.tsx`. Measured: 3.15 MB of script became 2.28 MB, and its stylesheet
   * 130 KB became 68 KB.
   */
  const monaco = await import('monaco-editor/esm/vs/editor/editor.api');

  /*
   * The language id is what the barrel used to register, and everything hangs
   * off it: the TS service attaches to it, shiki's grammar is installed under
   * it, and a model with no registered language is a model with no tokens at
   * all — plain grey text, measured. Monaco's own monarch tokenizer is not
   * imported with it, because shiki's TSX grammar is what tokenizes here.
   */
  monaco.languages.register({ id: 'typescript', extensions: ['.ts', '.tsx'] });
  await import('monaco-editor/esm/vs/language/typescript/monaco.contribution');
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
