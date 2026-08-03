export const meta = {
  title: 'Not found — __APP_NAME__',
  robots: 'noindex',
};

export default function NotFound() {
  return (
    <main class="fallback">
      <h1>Not found</h1>
      <p>There is no page at this address.</p>
      <a href="/">← Back to the board</a>
    </main>
  );
}
