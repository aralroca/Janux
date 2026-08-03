import { startTestServer } from './test-server';

/**
 * Serves an app for the Playwright fixtures, in its own Bun process.
 *
 * The Playwright runner is Node and the Janux server is Bun-first, so the
 * fixture cannot host the app in-process the way a `bun test` suite does. Prints
 * the URL on stdout — that line is the fixture's ready signal — and stays up
 * until the worker kills it.
 */
const root = process.argv[2];

if (!root) throw new Error('@janux/testing: serve <appRoot>');

const { url } = await startTestServer(root);

console.log(url);
