export const meta = {
  title: 'Janux — Settings',
  description: 'A second route, so the dialog has somewhere to be navigated away from.',
};

/**
 * This page exists for one reason: a Radix dialog portals into `<body>`, and a
 * client-side navigation has to be able to leave the page while it is open
 * without React throwing on unmount. There is no way to test that with one route.
 */
export default function Settings() {
  return (
    <div class="app">
      <header class="bar">
        <span class="brand">⚡ Settings</span>
        <a class="bar-link" href="/">
          ← Back
        </a>
      </header>
      <main class="plain">
        <p class="settings-note">Nothing to configure. Navigate back with the link above.</p>
      </main>
    </div>
  );
}
