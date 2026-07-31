/**
 * The upload, and the one step Bun cannot do.
 *
 * `bun publish` has no `--provenance` (checked against Bun 1.3), and provenance
 * is the whole reason a release runs on CI: it is the signed statement that
 * this tarball was built from this repository, at this commit, by this
 * workflow. Without it "published from a laptop" and "published from main" are
 * indistinguishable to anyone installing the package.
 *
 * So everything up to the archive is Bun's — build, manifest swap, pack, read
 * the tarball back — and only the last step is npm's, over a file that is
 * already final. npm publishes the tarball, not the workspace, so nothing here
 * depends on the manifest still being swapped in.
 */

export type PublishOptions = { readonly dryRun: boolean; readonly provenance: boolean };

/** Signing needs an OIDC token, which only a workflow granted `id-token: write` has. */
export function canAttestProvenance(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.ACTIONS_ID_TOKEN_REQUEST_URL && env.ACTIONS_ID_TOKEN_REQUEST_TOKEN);
}

export function publishArgs(tarball: string, options: PublishOptions): string[] {
  const provenance = options.provenance ? ['--provenance'] : [];
  const dryRun = options.dryRun ? ['--dry-run'] : [];

  return ['publish', tarball, '--access', 'public', ...provenance, ...dryRun];
}

/** A republish of an existing version is a hard error on npm, so it is a skip here. */
export async function alreadyPublished(name: string, version: string): Promise<boolean> {
  const response = await fetch(`https://registry.npmjs.org/${name.replace('/', '%2f')}/${version}`);

  return response.status === 200;
}

export function publish(tarball: string, options: PublishOptions): void {
  const args = publishArgs(tarball, options);
  const run = Bun.spawnSync(['npm', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });

  if (!run.success) throw new Error(`npm ${args.join(' ')} exited ${run.exitCode}`);
}
