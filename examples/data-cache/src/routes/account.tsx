export const meta = {
  title: 'Account — never shareable',
  description: 'A page whose content depends on the request. It declares no policy, and so it is private.',
};

/**
 * No `cache` export, on purpose. A page that renders something about *you* is
 * exactly what must not reach a shared cache, and the way Janux guarantees that
 * is by making silence mean `private, no-store` — the author never has to
 * remember. The route beside it (`/catalog`) had to say `scope: 'public'` out
 * loud to become cacheable.
 */
export default function AccountPage({ ctx }: { ctx: { user?: string } }) {
  return (
    <main class="page">
      <header class="page-head">
        <ul class="policy">
          <li class="badge private">private</li>
          <li class="badge">no-store</li>
          <li class="badge">declares nothing</li>
        </ul>
        <h1>Account</h1>
        <p>
          This page reads a session cookie, so it must never reach a shared cache — and it does not have to say so.
          A route that declares no policy answers <code>private, no-store</code>, which is what makes the guarantee
          hold for the routes nobody remembered to think about.
        </p>
      </header>
      <ul class="items">
        <li class="item" id="account-user">
          signed in as <small>{ctx.user ?? 'nobody'}</small>
        </li>
      </ul>
      <p class="rendered">rendered:{new Date().toISOString()}</p>
      <a class="back" href="/">
        ← back to the demo
      </a>
    </main>
  );
}
