import { defineConfig } from 'vite';
import { januxCompiler } from '../../lib/janux-compiler.mjs';

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
