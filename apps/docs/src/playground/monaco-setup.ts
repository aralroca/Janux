import { JANUX_DTS } from './janux-types';

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
  const model = monaco.editor.createModel(initial, 'typescript', monaco.Uri.parse('file:///playground.tsx'));
  const editor = monaco.editor.create(host, {
    model,
    theme: 'vs-dark',
    minimap: { enabled: false },
    fontSize: 13.5,
    automaticLayout: true,
    scrollBeyondLastLine: false,
    padding: { top: 12 },
  });

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
