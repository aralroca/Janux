import { defineConfig } from 'vite';

// Production-mode build like the sibling fixtures. No plugin needed: esbuild
// compiles the TSX through tsconfig.json's jsxImportSource ("janux"), and the
// island runtime is plain TS resolved from the workspace `janux` package.
export default defineConfig({
	mode: 'production',
	define: { 'process.env.NODE_ENV': JSON.stringify('production') },
	build: {
		target: 'esnext',
		minify: false,
		// Mirrors @janux/vite foreignExternals(): no React installed → the
		// interop's lazy import stays external and never emits chunks.
		rollupOptions: { external: ['react', 'react-dom', 'react-dom/client'] },
	},
	server: { port: 5240, strictPort: true },
});
