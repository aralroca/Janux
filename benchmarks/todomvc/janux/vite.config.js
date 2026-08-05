import { defineConfig } from 'vite';
import { januxCompiler } from '../../lib/janux-compiler.mjs';

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
		// Mirrors @janux/vite foreignExternals(): no React installed → the
		// interop's lazy import stays external and never emits chunks.
		rollupOptions: { external: ['react', 'react-dom', 'react-dom/client'] },
	},
	server: { port: 5240, strictPort: true },
});
