import { defineConfig } from 'vite';
// Relative on purpose: the harnesses load this config under Node, and the
// workspace @janux/vite ships TS sources Node cannot resolve — Vite's config
// loader bundles relative imports (TS included), leaving @swc/core external.
import { januxCompiler } from '../../../packages/janux-vite/src/compiler-plugin';

// Production-mode build like the sibling fixtures. esbuild compiles the TSX
// through tsconfig.json's jsxImportSource ("janux"); januxCompiler() is the
// shipped binding-maps transform — the rival fixtures ship their compilers too.
export default defineConfig({
	plugins: [januxCompiler()],
	mode: 'production',
	define: { 'process.env.NODE_ENV': JSON.stringify('production') },
	build: {
		target: 'esnext',
		minify: false,
		// What @janux/vite's foreignExternals() does for an app that has not
		// installed React: the interop's lazy `import('react')` stays external
		// (never fetched — no foreign() components here) instead of bundling
		// react-dom chunks that only resolve because the benchmarks workspace
		// hoists React for the rival fixtures.
		rollupOptions: { external: ['react', 'react-dom', 'react-dom/client'] },
	},
	server: { port: 5176, strictPort: true },
});
