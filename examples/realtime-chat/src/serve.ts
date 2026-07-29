import { createChatServer } from './server';

const port = Number(process.env.PORT ?? 4321);
const { url } = await createChatServer(port);

console.log(`realtime-chat listening on ${url} — serving dist/client (re-run \`bun run build\` after edits)`);
