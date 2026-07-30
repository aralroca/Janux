import { api } from '@janux/server';
import { schema, str } from 'janux';

/**
 * An RPC endpoint that doubles as an agent tool, answered by whichever runtime
 * is serving. It exists so the deployment can be checked from outside the
 * browser — `curl` it and the answer says which process replied.
 */
export const whoami = api({
  description: 'Reports the JavaScript runtime serving this app.',
  output: schema({ runtime: str(), version: str() }),
  run: () => runtimeInfo(),
});

/** Bun sets `process.versions.bun`; Node does not. Nothing else distinguishes them here. */
export function runtimeInfo(): { runtime: string; version: string } {
  const bun = process.versions.bun;

  return bun ? { runtime: 'Bun', version: bun } : { runtime: 'Node', version: process.versions.node };
}
