/** Echo endpoint the dev-websocket test drives — the `src/ws.ts` convention. */
export default {
  path: '/ws',
  data: (req: Request) => ({ user: new URL(req.url).searchParams.get('u') ?? 'anon' }),
  open(socket: any) {
    socket.send(`hello ${socket.data.user}`);
  },
  message(socket: any, raw: string | Uint8Array) {
    socket.send(`echo:${raw}`);
  },
};
