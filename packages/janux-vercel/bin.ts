#!/usr/bin/env bun
import { runVercelInit } from './src/cli';

await runVercelInit(process.argv.slice(2), process.cwd());
