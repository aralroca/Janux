import { component, enums, intent, schema } from 'janux';
import { Profile } from './Profile';
import { Team } from './Team';
import { Users } from './Users';
import { Workflow } from './Workflow';

const TABS = ['users', 'team', 'profile', 'workflows'];
const LABELS: Record<string, string> = {
  users: 'Users',
  team: 'Team',
  profile: 'Profile',
  workflows: 'Workflows',
};

export const Console = component({
  name: 'console',
  description: 'The console shell: which tab is on screen.',
  state: schema({ tab: enums(TABS).default('users') }),
  intents: {
    goToTab: intent({
      description: 'Switch the console to a tab.',
      input: schema({ tab: enums(TABS) }),
      run: ({ state, input }: any) => (state.tab = input.tab),
    }),
  },
  // Every panel stays mounted and CSS hides the inactive ones: switching tabs
  // must not throw away the workflow the agent just built.
  view: ({ state, intents }: any) => (
    <div class="console">
      <nav id="tabs">
        {TABS.map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={String(state.tab === tab)}
            on={intents.goToTab}
            data-input={JSON.stringify({ tab })}
          >
            {LABELS[tab]}
          </button>
        ))}
      </nav>
      <section class={state.tab === 'users' ? 'panel active' : 'panel'}>
        <Users />
      </section>
      <section class={state.tab === 'team' ? 'panel active' : 'panel'}>
        <Team />
      </section>
      <section class={state.tab === 'profile' ? 'panel active' : 'panel'}>
        <Profile />
      </section>
      <section class={state.tab === 'workflows' ? 'panel active' : 'panel'}>
        <p class="hint">
          A node-based flow editor built on React Flow (<code>@xyflow/react</code>), mounted unchanged
          with <code>foreign()</code>. Nodes the agent adds mount asynchronously, so the glow waits for them.
        </p>
        <Workflow />
      </section>
    </div>
  ),
});
