import { defineConfig } from 'vite';

// SSR-only fixture build (no client bundle — this suite is Node-only). The
// harness builds `src/entry-server.ts` with an outDir override under
// benchmarks/streaming-ssr/dist/. `janux` resolves to workspace TS sources, so
// it must be bundled IN for the built entry to run from dist/.
export default defineConfig({
	build: { target: 'esnext', minify: false },
	ssr: { noExternal: ['janux'] },
});
