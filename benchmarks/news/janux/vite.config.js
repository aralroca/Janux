import { defineConfig } from 'vite';

// No plugin needed: esbuild compiles the TSX through tsconfig.json's
// jsxImportSource ("janux"), like the js-framework fixture. The SSR bundles
// (entry-server / hydration-server) must inline the workspace `janux` package —
// it ships TypeScript sources, which Node cannot import externalized.
export default defineConfig({
	define: { 'process.env.NODE_ENV': JSON.stringify('production') },
	build: { target: 'esnext', minify: false },
	ssr: { noExternal: true },
	server: { port: 5191, strictPort: true },
});
