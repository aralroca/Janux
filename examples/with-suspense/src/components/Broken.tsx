import { component } from 'janux';

/** Its own `error` view: the failure never leaves the island. */
export const FailingCard = component({
  name: 'failing-card',
  description: 'A card whose view always throws, caught by its own error view.',
  error: ({ error }: any) => (
    <div class="card card-error">
      <strong>This card failed</strong>
      <code>{String(error)}</code>
    </div>
  ),
  view: () => {
    throw new Error('the card data was corrupt');
  },
});

/** No `error` view of its own: the throw bubbles to the closest ancestor with one. */
export const BrokenLeaf = component({
  name: 'broken-leaf',
  description: 'A leaf island that throws and has no error view.',
  view: () => {
    throw new Error('leaf exploded');
  },
});

/** The ancestor boundary: catches the leaf and replaces its whole subtree. */
export const BubbleShell = component({
  name: 'bubble-shell',
  description: 'Renders a broken leaf; its error view catches the bubbled throw.',
  error: ({ error }: any) => (
    <div class="card card-error">
      <strong>Caught from a nested island</strong>
      <code>{String(error)}</code>
    </div>
  ),
  view: () => (
    <section class="card">
      <h3>Shell content (discarded on error)</h3>
      <BrokenLeaf />
    </section>
  ),
});
