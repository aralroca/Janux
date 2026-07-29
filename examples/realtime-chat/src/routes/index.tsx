import { ChatRoom } from '../components/ChatRoom';

export const meta = {
  title: 'Janux — realtime chat',
  description: 'Multi-room chat over a custom Bun server: optimistic delivery, replay on reconnect, live presence.',
};

export default function Home() {
  return (
    <div class="app">
      <header class="masthead">
        <span class="brand">✦ Realtime chat</span>
        <p>
          A custom server composes <code>createJanuxServer</code> with Bun&apos;s native WebSockets: sends paint
          optimistically and confirm on the server echo, reconnections replay the room log from a cursor, and
          presence is live. Try <strong>drop connection</strong> while another tab keeps talking.
        </p>
      </header>
      <main>
        <ChatRoom eager />
      </main>
    </div>
  );
}
