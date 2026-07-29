import { NavCounter } from '../components/NavCounter';

/** `[href, label, the prefix that keeps the link active]`. */
const LINKS: [string, string, string][] = [
  ['/', 'Home', '/'],
  ['/wiki', 'Wiki', '/wiki'],
  ['/docs/guides/install', 'Docs', '/docs'],
  ['/search', 'Search', '/search'],
  ['/tickets', 'Tickets', '/tickets'],
  ['/pricing', 'Pricing', '/pricing'],
];

interface ShellProps {
  children: unknown;
  ctx?: { pathname?: string };
}

/** A section owns its prefix and everything under it; Home owns only `/`. */
function isActive(pathname: string, prefix: string): boolean {
  if (prefix === '/') return pathname === '/';

  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** The root shell: the same header on every page, only the active tab moves. */
export default function RootLayout({ children, ctx }: ShellProps) {
  const pathname = ctx?.pathname ?? '/';

  return (
    <div class="kb-shell" data-shell="root">
      <header class="shell-bar">
        <a class="brand" href="/">
          <span class="brand-mark" aria-hidden="true">
            ◆
          </span>
          Janux KB
        </a>
        <nav class="shell-nav" aria-label="Sections">
          {LINKS.map(([href, label, prefix]) => (
            <a key={href} class="nav-link" href={href} aria-current={isActive(pathname, prefix) ? 'page' : undefined}>
              {label}
            </a>
          ))}
        </nav>
        <NavCounter persist />
      </header>
      <main class="shell-main">{children}</main>
    </div>
  );
}
