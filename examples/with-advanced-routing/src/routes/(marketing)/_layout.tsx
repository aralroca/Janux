const GROUP_LINKS: [string, string][] = [
  ['/pricing', 'Pricing'],
  ['/about', 'About'],
];

interface GroupShellProps {
  children: unknown;
  ctx?: { pathname?: string };
}

/**
 * The group's own sub-shell: `(marketing)` never shows up in the URL, but its
 * layout wraps everything inside the directory — /about and /pricing share
 * this banner without sharing a URL prefix.
 */
export default function MarketingLayout({ children, ctx }: GroupShellProps) {
  return (
    <div class="marketing" data-shell="marketing">
      <p class="banner">From the marketing team — the URL says nothing about us.</p>
      <nav class="group-nav" aria-label="Marketing">
        {GROUP_LINKS.map(([href, label]) => (
          <a key={href} class="group-link" href={href} aria-current={ctx?.pathname === href ? 'page' : undefined}>
            {label}
          </a>
        ))}
      </nav>
      {children}
    </div>
  );
}
