import { defineConfig } from 'vite';
// Relative on purpose: the harnesses load this config under Node, and the
// workspace @janux/vite ships TS sources Node cannot resolve — Vite's config
// loader bundles relative imports (TS included), leaving @swc/core external.
import { januxCompiler } from '../../../packages/janux-vite/src/compiler-plugin';

// esbuild compiles the TSX through tsconfig.json's jsxImportSource ("janux");
// januxCompiler() is the shipped binding-maps transform, like the js-framework
// fixture. The SSR bundles
// (entry-server / hydration-server) must inline the workspace `janux` package —
// it ships TypeScript sources, which Node cannot import externalized.
export default defineConfig({
	plugins: [januxCompiler()],
	define: { 'process.env.NODE_ENV': JSON.stringify('production') },
	build: { target: 'esnext', minify: false },
	ssr: { noExternal: true },
	server: { port: 5191, strictPort: true },
});
