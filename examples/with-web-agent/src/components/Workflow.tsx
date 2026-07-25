import { component, intent, list, obj, schema, str } from 'janux';
import { foreign } from 'janux/interop';
import { FlowCanvas } from './FlowCanvas';

/** `hydrate: 'only'` skips SSR — React Flow measures the viewport on mount. */
const Canvas = foreign(FlowCanvas, {
  name: 'wf-canvas',
  hydrate: 'only',
  props: (own: any) => ({ steps: own.state.steps }),
});

export const Workflow = component({
  name: 'workflow',
  description: 'A node-based flow. Steps run top to bottom.',
  state: schema({
    steps: list(obj({ id: str(), label: str() })).default([{ id: 'wf-0', label: 'Start' }]),
  }),
  intents: {
    addStep: intent({
      description: 'Add a step to the workflow.',
      input: schema({ label: str() }),
      // React Flow mounts the node a tick after `run` returns, so pointing at an
      // element would be too early: the selector lets the ring wait for it.
      glowTarget: ({ state }: any) => `.react-flow__node[data-id="${state.steps.at(-1).id}"]`,
      run: ({ state, input }: any) =>
        state.steps.push({ id: `wf-${state.steps.length}`, label: input.label }),
    }),
  },
  view: ({ state }: any) => (
    <div class="wf-canvas">
      <Canvas state={state} />
    </div>
  ),
});
