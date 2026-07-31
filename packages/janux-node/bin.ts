#!/usr/bin/env bun
/** `bunx janux-node --include content` — runs after `janux build`. */
import { runAdapter } from '@janux/cli/adapter/build';
import { node } from './src/index';

const include = process.argv.flatMap((arg, index) =>
  arg === '--include' && process.argv[index + 1] ? [process.argv[index + 1]!] : [],
);

await runAdapter(node({ include }), process.cwd());
