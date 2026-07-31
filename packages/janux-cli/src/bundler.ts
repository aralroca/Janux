#!/usr/bin/env bun
/**
 * The bundling half of `buildFunction`, in its own process so it can run with
 * the app as its working directory: `Bun.build` resolves packages from the
 * working directory, not from the importer, so bundling an app from anywhere
 * else cannot find that app's dependencies.
 */
import type { BunPlugin } from 'bun';

/**
 * A Vite query suffix (`?worker`, `?url`, `?raw`, `?inline`) is a request for a
 * browser asset: the client build resolves it, a server never can. They reach
 * the server graph through islands, whose client code is lazily imported from a
 * component the router does render — so the specifier is in the bundle's graph
 * while the code behind it only ever runs in a browser. Stubbing it is what
 * keeps a playground island from taking the whole deployment down with it.
 */
const clientOnlyAssets: BunPlugin = {
  name: 'janux-client-only-assets',
  setup(build) {
    build.onResolve({ filter: /\?(worker|url|raw|inline)\b/ }, ({ path }) => ({ path, namespace: 'janux-client-only' }));
    build.onLoad({ filter: /.*/, namespace: 'janux-client-only' }, () => ({
      contents: 'export default undefined;',
      loader: 'js',
    }));
  },
};

const [entry, outfile, target] = process.argv.slice(2);
// Written here rather than through `outdir`: the output path is the caller's
// business, and Bun's naming templates only get in the way of one file.
const built = await Bun.build({
  entrypoints: [entry!],
  target: (target as 'node' | 'bun') ?? 'bun',
  plugins: [clientOnlyAssets],
});

if (!built.success) {
  console.error(built.logs.map(String).join('\n'));
  process.exit(1);
}
await Bun.write(outfile!, built.outputs[0]!);
