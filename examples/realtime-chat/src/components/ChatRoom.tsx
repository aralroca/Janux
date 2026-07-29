import { bool, component, enums, int, intent, list, schema, str } from 'janux';
import { connect, disconnect, dropConnection, joinRoom, post } from '../socket';

const ROOMS = ['general', 'random'];

/** Live delivery and replay can overlap around a reconnect — dedupe by id. */
function confirmOrAppend(state: any, incoming: any) {
  const existing = state.messages.find((message: any) => message.id === incoming.id);

  if (!existing) {
    state.messages.push({ id: incoming.id, seq: incoming.seq, user: incoming.user, text: incoming.text, pending: false });

    return;
  }
  existing.seq = incoming.seq;
  existing.pending = false;
}

const messageRow = (message: any) => (
  <li key={message.id} class={message.pending ? 'msg pending' : 'msg'} data-seq={String(message.seq)}>
    <span class="author">{message.user}</span>
    <span class="text">{message.text}</span>
  </li>
);

/**
 * The whole chat is one island. The WebSocket lives in `lifecycle.attach` /
 * `detach` (client-only: SSR renders the connecting shell), and every server
 * event mutates `state`, which is all the re-rendering there is.
 */
export const ChatRoom = component({
  name: 'chat',
  description: 'Multi-room chat over the custom server: optimistic delivery, replay on reconnect, live presence.',

  state: schema({
    user: str().default(''),
    room: str().default('general'),
    status: enums(['connecting', 'online', 'offline']).default('connecting'),
    users: list({ name: str() }),
    messages: list({
      id: str(),
      seq: int().default(0),
      user: str(),
      text: str(),
      pending: bool().default(false),
    }),
  }),

  emits: {
    'chat.status': schema({ status: str() }),
    'chat.message': schema({ room: str(), id: str(), seq: int(), user: str(), text: str() }),
    'chat.presence': schema({ room: str(), users: list({ name: str() }) }),
  },

  lifecycle: {
    attach: ({ state, emit }) => {
      if (typeof document === 'undefined') return;
      state.user = `guest-${Math.random().toString(36).slice(2, 6)}`;
      connect({ state, emit });
    },
    detach: () => disconnect(),
  },

  /**
   * The socket module re-emits every server frame on the page bus; these
   * handlers are the only writers, which is what the mutation gate demands.
   */
  on: {
    'chat.status': ({ state, event }) => {
      state.status = event.status;
      if (event.status !== 'online') state.users = [];
    },
    'chat.message': ({ state, event }) => {
      if (event.room === state.room) confirmOrAppend(state, event);
    },
    'chat.presence': ({ state, event }) => {
      if (event.room === state.room) state.users = event.users;
    },
  },

  intents: {
    send: intent({
      description: 'Send a message to the current room. Optimistic: it renders before the server echo confirms it.',
      input: schema({ text: str() }),
      run: ({ state, input }) => {
        const text = String(input.text ?? '').trim();

        if (text) post(state, text);
      },
    }),
    switchRoom: intent({
      description: 'Join another room; its history is replayed from the server log (cursor 0).',
      input: schema({ room: str().min(1) }),
      run: ({ state, input }) => joinRoom(state, input.room),
    }),
    drop: intent({
      description: 'Demo: drop the WebSocket like a flaky network — the client reconnects and replays what it missed.',
      run: () => dropConnection(),
    }),
  },

  view: ({ state, intents }) => (
    <section class="chat">
      <header class="bar">
        <nav class="rooms">
          {ROOMS.map((room) => (
            <button
              key={room}
              class={room === state.room ? 'room active' : 'room'}
              onClick={intents.switchRoom.with({ room })}
            >
              #{room}
            </button>
          ))}
        </nav>
        <span class={`status ${state.status}`} data-status={state.status}>
          {state.status}
        </span>
        <button class="drop" onClick={intents.drop}>
          drop connection
        </button>
      </header>
      <ul class="presence">
        {state.users.map((entry: any) => (
          <li key={entry.name} class="user">
            {entry.name}
          </li>
        ))}
      </ul>
      <ul class="messages">{state.messages.map(messageRow)}</ul>
      <form class="composer" onSubmit={intents.send} data-jxreset="true">
        <input name="text" placeholder={`Message #${state.room} as ${state.user || '…'}`} autoComplete="off" />
        <button type="submit">Send</button>
      </form>
    </section>
  ),
});
