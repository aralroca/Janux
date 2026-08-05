import { api } from '@janux/server';
import { schema, str } from 'janux';

/** The product knowledge base the research subagent answers from. */
export const KNOWLEDGE_BASE = [
  { id: 'kb-1', topic: 'installation', body: 'Scaffold a new app with `bunx create-janux my-app` and start it with `bun dev`.' },
  { id: 'kb-2', topic: 'islands', body: 'Only islands ship JavaScript; static views ship none — that is the 0-JS guarantee.' },
  { id: 'kb-3', topic: 'subagents', body: 'Subagents run server-side with their own prompt and tools, always under a mandatory budget.' },
  { id: 'kb-4', topic: 'handoffs', body: 'A handoff transfers the conversation to a specialist agent that answers the user from then on.' },
] as const;

export const search = api({
  description: 'Search the product knowledge base by keyword.',
  input: schema({ q: str().min(1) }),
  run: ({ input }) =>
    KNOWLEDGE_BASE.filter((entry) => `${entry.topic} ${entry.body}`.toLowerCase().includes(input.q.toLowerCase())),
});
