import { bool, component, intent, schema, str } from 'janux';
import { foreign } from 'janux/interop';
import { ConfirmDialog } from './ConfirmDialog';

const Sheet = foreign(ConfirmDialog, {
  name: 'confirm-dialog',
  props: (own: any) => ({ open: own.state.open, workspace: own.state.workspace }),
  on: {
    onOpenChange: { intent: 'setOpen', input: ({ args }: any) => ({ open: Boolean(args[0]) }) },
    onConfirmed: { intent: 'remove', input: () => ({}) },
  },
});

/** The wrap-once pattern on an a11y primitive: Radix owns the trap, the island owns the decision. */
export const ConfirmDialogShell = component({
  name: 'workspace',
  description: 'A destructive confirmation. Radix owns the dialog; whether it is open and whether it fired are Janux.',
  state: schema({
    workspace: str().default('Acme'),
    open: bool().default(false),
    deleted: bool().default(false),
  }),
  intents: {
    setOpen: intent({
      description: 'Open or close the dialog',
      input: schema({ open: bool().default(true) }),
      run: ({ state, input }: any) => (state.open = input.open),
    }),
    remove: intent({
      description: 'Delete the workspace. Needs human approval.',
      guard: 'confirm',
      run: ({ state }: any) => {
        state.deleted = true;
        state.open = false;
      },
    }),
  },
  view: ({ state }: any) => (
    <section class="dialog-shell">
      <p class="dialog-status">
        {state.deleted ? `${state.workspace} deleted` : `${state.workspace} · dialog ${state.open ? 'open' : 'closed'}`}
      </p>
      <Sheet state={state} />
    </section>
  ),
});
