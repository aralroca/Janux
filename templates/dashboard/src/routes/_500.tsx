export const meta = {
  title: 'Something broke — __APP_NAME__',
  robots: 'noindex',
};

export default function ServerError() {
  return (
    <main class="fallback">
      <h1>Something broke</h1>
      <p>The page failed to render. The error is in the server logs.</p>
      <a href="/">← Back to the board</a>
    </main>
  );
}
