/**
 * The playground's sandboxed iframe, built as its own pair of entries.
 *
 * The frame is created from a `srcdoc` string, so no bundler ever sees the two
 * modules it loads: in dev Vite serves them from source, and in production they
 * were plain 404s — the editor came up and the preview pane stayed empty. They
 * need stable, buildable URLs, which is what this second build produces:
 * `/pg-frame.js` and `/pg-runtime.js`, beside the app's own assets.
 *
 * `janux*` stays external in the frame entry on purpose. The import map inside
 * the iframe points every one of those specifiers at `/pg-runtime.js`, exactly
 * as it points them at the source module in dev — one runtime instance, shared
 * by the frame and the code it runs.
 */
const JANUX_SPECIFIERS = ['janux', 'janux/jsx-runtime', 'janux/jsx-dev-runtime', 'janux/client'];

export default {
  esbuild: { jsx: 'automatic', jsxImportSource: 'janux' },
  build: {
    outDir: 'dist/client',
    // The app's build ran first; this one only adds to it.
    emptyOutDir: false,
    rollupOptions: {
      /*
       * `pg-runtime` exists to be imported — it is what the iframe's import map
       * resolves `janux` to. Without this, the bundler treats both entries as
       * applications and drops their exports, and the first snippet the
       * playground runs dies on "does not provide an export named 'jsxDEV'".
       */
      preserveEntrySignatures: 'strict',
      input: { 'pg-frame': 'src/playground/pg-frame.ts', 'pg-runtime': 'src/playground/pg-runtime.ts' },
      external: (id: string, importer: string | undefined) =>
        JANUX_SPECIFIERS.includes(id) && Boolean(importer?.includes('pg-frame')),
      output: { entryFileNames: '[name].js', chunkFileNames: 'assets/[name]-[hash].js', format: 'es' },
    },
  },
};
