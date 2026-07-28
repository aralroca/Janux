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
		// What @janux/vite's foreignExternals() does for an app that has not
		// installed React: the interop's lazy `import('react')` stays external
		// (never fetched — no foreign() components here) instead of bundling
		// react-dom chunks that only resolve because the benchmarks workspace
		// hoists React for the rival fixtures.
		rollupOptions: { external: ['react', 'react-dom', 'react-dom/client'] },
	},
	server: { port: 5176, strictPort: true },
});
