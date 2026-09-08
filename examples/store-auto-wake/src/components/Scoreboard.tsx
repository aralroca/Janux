import { component } from 'janux';
import { score } from '../stores';

/**
 * A pure reader — and deliberately NOT `eager`. It ships as inert HTML and
 * resumes only when the store's first write makes that HTML stale. The
 * conditional is the point: the server rendered the "kickoff" branch, the
 * wake re-runs the view against live state and reconciles the flip in place.
 */
export const Scoreboard = component({
  name: 'scoreboard',
  description: 'Header scoreboard; wakes on the first goal.',
  use: { score },
  view: ({ use }: any) => (
    <output class="scoreboard">
      {use.score.derived.total === 0 ? 'Kickoff pending…' : `${use.score.state.home} – ${use.score.state.away}`}
    </output>
  ),
});
