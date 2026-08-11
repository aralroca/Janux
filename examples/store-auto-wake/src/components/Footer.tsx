import { component, schema, int } from 'janux';

/** No `use`, no wake: store writes are none of its business — it stays inert forever. */
export const Footer = component({
  name: 'match-footer',
  description: 'Static footer that never resumes.',
  state: schema({ season: int().default(2026) }),
  view: ({ state }: any) => <footer class="foot">Season {state.season} · resumability demo</footer>,
});
