import { component, int, intent, list, obj, schema, str } from 'janux';
import { foreign } from 'janux/interop';
import { GraphEditor } from './GraphEditor';

const NODES = [
  { id: 'ingest', label: 'Ingest', x: 40, y: 40 },
  { id: 'verify', label: 'Verify', x: 40, y: 160 },
  { id: 'decide', label: 'Decide', x: 40, y: 280 },
];

const EDGES = [{ id: 'ingest-verify', source: 'ingest', target: 'verify' }];

const Canvas = foreign(GraphEditor, {
  name: 'graph-canvas',
  // React Flow measures the viewport on mount, and the server has none: SSR
  // would render a zero-sized canvas. `only` says that out loud instead of
  // leaning on the silent fail-soft catch.
  hydrate: 'only',
  props: (own: any) => ({ nodes: own.state.nodes, edges: own.state.edges }),
  on: {
    // `onNodeDragStop(event, node)` — the payload is the SECOND argument again,
    // and the node it carries is a live React Flow object, not JSON.
    onNodeDragStop: {
      intent: 'moveNode',
      input: ({ args }: any) => ({
        id: String(args[1]?.id),
        x: Math.round(args[1]?.position?.x ?? 0),
        y: Math.round(args[1]?.position?.y ?? 0),
      }),
    },
    onConnect: {
      intent: 'connect',
      input: ({ args }: any) => ({ source: String(args[0]?.source), target: String(args[0]?.target) }),
    },
  },
});

/** The wrap-once pattern on a canvas library: the graph is state, the editor is a view of it. */
export const GraphEditorShell = component({
  name: 'graph',
  description: 'A node graph. Nodes and edges live in typed state; the editor is a foreign React Flow island.',
  state: schema({
    nodes: list(obj({ id: str(), label: str(), x: int(), y: int() })).default(NODES),
    edges: list(obj({ id: str(), source: str(), target: str() })).default(EDGES),
  }),
  intents: {
    addNode: intent({
      description: 'Add a node to the graph',
      input: schema({ label: str().default('New step') }),
      run: ({ state, input }: any) => {
        const id = `n${state.nodes.length}`;

        state.nodes = [...state.nodes, { id, label: input.label, x: 280, y: 40 + state.nodes.length * 80 }];
      },
    }),
    connect: intent({
      description: 'Connect two nodes',
      // Real node ids as defaults: the panel builds its example payload from the
      // schema, and `source: 'example'` would generate a call that connects
      // nothing — a button that looks like it works and does not.
      input: schema({ source: str().default('decide'), target: str().default('ingest') }),
      run: ({ state, input }: any) => {
        const id = `${input.source}-${input.target}`;

        if (input.source === input.target) return;
        if (state.edges.some((edge: any) => edge.id === id)) return;
        state.edges = [...state.edges, { id, source: input.source, target: input.target }];
      },
    }),
    moveNode: intent({
      description: 'Move a node to a position',
      input: schema({ id: str().default('verify'), x: int().default(300), y: int().default(200) }),
      run: ({ state, input }: any) => {
        state.nodes = state.nodes.map((node: any) =>
          node.id === input.id ? { ...node, x: input.x, y: input.y } : node,
        );
      },
    }),
    clear: intent({
      description: 'Remove every edge. Needs human approval.',
      guard: 'confirm',
      run: ({ state }: any) => (state.edges = []),
    }),
  },
  view: ({ state }: any) => (
    <section class="graph-shell">
      <p class="graph-summary">
        {`${state.nodes.length} nodes · ${state.edges.length} edges`}
        {state.edges.length ? ` · ${state.edges.map((edge: any) => edge.id).join(', ')}` : ''}
      </p>
      <div class="graph-canvas">
        <Canvas state={state} />
      </div>
    </section>
  ),
});
