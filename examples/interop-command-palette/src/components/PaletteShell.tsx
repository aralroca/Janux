import { component, enums, intent, list, obj, schema, str } from 'janux';
import { foreign } from 'janux/interop';
import { Palette } from './Palette';

const COMMANDS = [
  { id: 'new-doc', label: 'New document', group: 'Create' },
  { id: 'new-folder', label: 'New folder', group: 'Create' },
  { id: 'toggle-theme', label: 'Toggle theme', group: 'View' },
  { id: 'zen-mode', label: 'Zen mode', group: 'View' },
  { id: 'archive', label: 'Archive workspace', group: 'Danger' },
];

const IDS = COMMANDS.map((command) => command.id);

const Bar = foreign(Palette, {
  name: 'palette',
  props: (own: any) => ({ commands: own.state.commands, query: own.state.query }),
  on: {
    // cmdk is the easy end of the spectrum: both callbacks hand over exactly one
    // scalar, already the payload. The mapper only names the field the intent
    // declares — `on: { onRun: 'run' }` would be enough if `run` took a bare
    // string. Kept object-shaped because that is what reads well as a tool.
    onQueryChange: { intent: 'search', input: ({ args }: any) => ({ query: String(args[0] ?? '') }) },
    onRun: { intent: 'run', input: ({ args }: any) => ({ id: String(args[0]) }) },
  },
});

/** The palette's command list and the agent's tool schema are the same list. */
export const PaletteShell = component({
  name: 'palette',
  description: 'A command palette. The commands live in typed state; the palette itself is a foreign cmdk island.',
  state: schema({
    commands: list(obj({ id: str(), label: str(), group: str() })).default(COMMANDS),
    query: str().default(''),
    ran: list(str()).default([]),
  }),
  intents: {
    search: intent({
      description: 'Type into the palette filter',
      input: schema({ query: str() }),
      run: ({ state, input }: any) => (state.query = input.query),
    }),
    run: intent({
      description: 'Run one command by id',
      // The enum IS the palette's command list: whatever a human can pick, the
      // agent can call, and neither can invent a command that does not exist.
      input: schema({ id: enums(IDS) }),
      run: ({ state, input }: any) => {
        state.ran = [...state.ran, input.id];
        state.query = '';
      },
    }),
    clear: intent({
      description: 'Clear the history of run commands. Needs human approval.',
      guard: 'confirm',
      run: ({ state }: any) => (state.ran = []),
    }),
  },
  view: ({ state }: any) => (
    <section class="palette-shell">
      <Bar state={state} />
      <p class="palette-log">
        {state.ran.length ? `ran: ${state.ran.join(', ')}` : 'nothing run yet'}
      </p>
    </section>
  ),
});
