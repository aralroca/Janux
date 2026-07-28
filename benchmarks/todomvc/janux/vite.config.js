import { defineConfig } from 'vite';

// Production-mode build like the sibling fixtures. No plugin needed: esbuild
// compiles the TSX through tsconfig.json's jsxImportSource ("janux"), and the
// island runtime is plain TS resolved from the workspace `janux` package.
export default defineConfig({
	mode: 'production',
	define: { 'process.env.NODE_ENV': JSON.stringify('production') },
	build: { target: 'esnext', minify: false },
	server: { port: 5240, strictPort: true },
});
