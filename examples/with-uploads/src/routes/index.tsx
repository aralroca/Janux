import { Gallery } from '../components/Gallery';

export const meta = {
  title: 'Janux — file uploads',
  description: 'A drag-and-drop image gallery: dropzone() on the client, a multipart HTTP handler on the server.',
};

export default function Home() {
  return (
    <main class="page">
      <header class="masthead">
        <h1>Uploads</h1>
        <p class="hint">
          <code>dropzone()</code> feeds a multipart <code>POST /api/uploads</code> handler; the gallery below is
          server-rendered from the same store agents read via <code>api.uploads.list</code>.
        </p>
      </header>
      <Gallery eager />
    </main>
  );
}
