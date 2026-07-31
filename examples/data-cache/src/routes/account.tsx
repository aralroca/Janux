export const meta = {
  title: 'Account — never shareable',
  description: 'A page whose content depends on the request. It declares no policy, and so it is private.',
};

/**
 * No `cache` export, on purpose. A page that renders something about *you* is
 * exactly what must not reach a shared cache, and the way Janux guarantees that
 * is by making silence mean `private, no-store` — the author never has to
 * remember. The route above it (`/catalog`) had to say `scope: 'public'` out
 * loud to become cacheable.
 */
export default function AccountPage({ ctx }: { ctx: { user?: string } }) {
  return (
    <main class="app">
      <header class="bar">
        <span class="brand">Account</span>
        <span class="bar-hint">private · no-store · declares nothing</span>
      </header>
      <p id="account-user">signed in as: {ctx.user ?? 'nobody'}</p>
      <p>
        <a href="/">← back to the demo</a>
      </p>
    </main>
  );
}
