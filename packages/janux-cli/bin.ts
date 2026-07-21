#!/usr/bin/env bun
import { runCli } from './src/index';

runCli(process.argv.slice(2)).catch((error) => {
  console.error(String(error));
  process.exit(1);
});
