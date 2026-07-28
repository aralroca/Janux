/** Static (0 KB): plain links — the router streams and diffs the next page. */
export function Nav({ active }: { active: string }) {
  const links = [
    ['/', 'Home'],
    ['/dashboard', 'Dashboard (slow)'],
    ['/broken', 'Broken (errors)'],
  ];

  return (
    <header class="bar">
      <span class="brand">⚡ Suspense</span>
      <nav>
        {links.map(([href, label]) => (
          <a href={href} class={href === active ? 'active' : ''} key={href}>
            {label}
          </a>
        ))}
      </nav>
    </header>
  );
}
