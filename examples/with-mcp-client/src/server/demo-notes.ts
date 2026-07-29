/**
 * The domain of the built-in demo MCP server: a three-note knowledge base
 * about MCP itself. Every tool works with `{}` (each argument has a default),
 * so the page's one-click invocation returns a real result with no typing.
 */

export interface Note {
  id: string;
  title: string;
  body: string;
}

export interface DemoTool {
  name: string;
  description: string;
  input: Record<string, unknown>;
  run(args: Record<string, unknown>): unknown;
}

export const NOTES: Note[] = [
  {
    id: 'mcp-basics',
    title: 'What MCP is',
    body: 'The Model Context Protocol is JSON-RPC 2.0 over a transport. A server advertises tools with JSON Schema inputs via tools/list, and runs one with tools/call. Nothing else is required to be a server.',
  },
  {
    id: 'streamable-http',
    title: 'Streamable HTTP transport',
    body: 'Every request is a POST with a JSON-RPC body. Stateless servers answer tools/list and tools/call without a session; legacy ones expect an initialize handshake first, which the Janux client falls back to when a modern request is rejected.',
  },
  {
    id: 'namespaces',
    title: 'Namespacing and allowlists',
    body: 'A client that merges several servers into one tool list must namespace them: Janux prefixes remote names (remote.notes.search) so a remote search never collides with a local one, and filters them with the same include/exclude semantics as defineAgent({ tools }).',
  },
];

const summary = ({ id, title }: Note) => ({ id, title });

const text = (property: string, fallback: string) => ({
  type: 'object',
  properties: { [property]: { type: 'string', default: fallback } },
});

function readNote(id: string) {
  const note = NOTES.find((entry) => entry.id === id);

  if (!note) throw new Error(`unknown_note: ${id}`);

  return note;
}

function searchNotes(query: string) {
  const needle = query.toLowerCase();
  const matches = NOTES.filter((note) => `${note.title} ${note.body}`.toLowerCase().includes(needle));

  return { query, matches: matches.map(summary) };
}

export const DEMO_TOOLS: DemoTool[] = [
  {
    name: 'notes.list',
    description: 'List every note this demo MCP server hosts (id and title).',
    input: { type: 'object', properties: {} },
    run: () => ({ notes: NOTES.map(summary) }),
  },
  {
    name: 'notes.read',
    description: 'Read one note in full by id (default: mcp-basics).',
    input: text('id', 'mcp-basics'),
    run: (args) => readNote(String(args.id ?? 'mcp-basics')),
  },
  {
    name: 'notes.search',
    description: 'Search the notes by substring (default query: tools).',
    input: text('query', 'tools'),
    run: (args) => searchNotes(String(args.query ?? 'tools')),
  },
];
