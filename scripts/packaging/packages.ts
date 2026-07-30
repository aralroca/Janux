/** The publishable packages, in dependency order: a package ships after everything it depends on. */
export const PUBLISH_ORDER = [
  'janux',
  'janux-server',
  'janux-agent',
  'janux-vite',
  'janux-tailwind',
  'janux-cli',
  'janux-vercel',
  'janux-node',
  'create-janux',
] as const;

/** Where tarballs are written, by both the release and the CI smoke job. */
export const PACKED = '.packed';

export type Manifest = Record<string, any>;

export function packageDir(dir: string): string {
  return `packages/${dir}`;
}

export function isPublishable(dir: string): boolean {
  return (PUBLISH_ORDER as readonly string[]).includes(dir);
}

export async function readManifest(dir: string): Promise<Manifest> {
  return Bun.file(`${packageDir(dir)}/package.json`).json();
}
