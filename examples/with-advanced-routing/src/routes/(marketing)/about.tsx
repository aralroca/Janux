export const meta = { title: 'About — Janux KB' };

/** Served at /about, wrapped by the group's marketing sub-shell. */
export default function AboutPage() {
  return (
    <section class="card about">
      <p class="eyebrow">Route group</p>
      <h1>About</h1>
      <p class="lead">
        This page lives in <code>src/routes/(marketing)/about.tsx</code> and is served at <code>/about</code> — the
        group directory groups files and attaches a layout, nothing more.
      </p>
    </section>
  );
}
