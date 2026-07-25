import { buildManifest, component, intent, schema, int } from 'janux';
import { Layout } from '../components/Layout';
import { DocsCopilot } from '../components/DocsCopilot';
import { renderMarkdown } from '../server/markdown';

export const meta = {
  title: 'Janux — the agent-native fullstack UI framework',
  description:
    'One component, two faces: a live view for humans, typed MCP tools & resources for AI agents — generated from the same definition.',
};

const SAMPLE_CODE = `import { component, intent, schema, int } from 'janux';

export const Counter = component({
  name: 'counter',
  state: schema({ count: int() }),
  intents: {
    inc: intent({
      description: 'Increment the counter',
      input: schema({ by: int().default(1) }),
      run: ({ state, input }) => (state.count += input.by),
    }),
    reset: intent({ guard: 'confirm', run: ({ state }) => (state.count = 0) }),
  },
  view: ({ state, intents }) => (
    <section class="flex flex-col items-center gap-5 pt-16 font-sans">
      <h1 class="text-6xl font-extrabold tracking-tight">{state.count}</h1>
      <div class="flex gap-3">
        <button on={intents.inc}
          class="rounded-xl bg-violet-600 px-6 py-2.5 font-bold text-white
                 shadow-lg shadow-violet-600/30 hover:bg-violet-700">
          +1
        </button>
        <button on={intents.reset}
          class="rounded-xl border border-neutral-300 px-6 py-2.5
                 font-semibold text-neutral-500 hover:border-neutral-400">
          Reset
        </button>
      </div>
    </section>
  ),
});`;

const sampleDef = component({
  name: 'counter',
  state: schema({ count: int() }),
  intents: {
    inc: intent({
      description: 'Increment the counter',
      input: schema({ by: int().default(1) }),
      run: ({ state, input }: any) => (state.count += input.by),
    }),
    reset: intent({ guard: 'confirm', run: ({ state }: any) => (state.count = 0) }),
  },
  view: () => null,
});

const FEATURES = [
  ['🧿', 'One definition, three projections', 'A component is a view, a resource (ui://counter) and typed tools at once. The mounted tree IS the MCP tree.'],
  ['🪶', '0 KB JS static pages', 'Components without state compile to plain HTML. No islands on the page? No <script> at all.'],
  ['⚡', 'Structural resumability', 'Resume from JSON snapshots — no hydration replay, no closure serialization. Zero component code until first interaction.'],
  ['🛡️', 'Guards built in', 'auto / confirm / forbidden on every action. Agent proposals get approved by humans, with an audit trail.'],
  ['🔌', 'api() — three things at once', 'A server function is a validated endpoint, a ~100-byte client stub and an agent tool. Defined once.'],
  ['🤖', 'Zero-config copilot', 'Set JANUX_MODEL or one provider key. Manifest, agent endpoint and window.janux bridge come with every app.'],
] as const;

export default async function Home() {
  const manifest = buildManifest([{ def: sampleDef }]);
  const code = await renderMarkdown('```tsx live\n' + SAMPLE_CODE + '\n```');
  const manifestJson = await renderMarkdown(
    '```json\n' + JSON.stringify({ resources: manifest.resources.map((r) => r.uri), tools: manifest.tools }, null, 2) + '\n```',
  );

  return (
    <Layout current="/" sidebar={false}>
      <main class="home">
        <section class="hero">
          <img
            class="hero-janus"
            src="/janus.svg"
            alt="Janus, the two-faced Roman god"
            width="130"
            height="157"
          />
          <h1>
            One component. <span class="gradient">Two faces.</span>
          </h1>
          <p class="tagline">
            The agent-native fullstack UI framework: a live view for humans, typed MCP tools &amp;
            resources for AI agents — generated from the same definition, so they can never drift.
          </p>
          <div class="hero-actions">
            <a class="cta" href="/docs/getting-started/quick-start">
              Get started
            </a>
            <a class="cta ghost" href="https://github.com/aralroca/Janux">
              GitHub
            </a>
          </div>
          <div class="code-block install-block">
            <pre class="install">bun create janux my-app</pre>
            <button class="copy-code" type="button" aria-label="Copy command">
              <svg class="ic-copy" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              <svg class="ic-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </button>
          </div>
        </section>

        <section class="demo">
          <video
            autoplay
            muted
            loop
            playsinline
            preload="metadata"
            poster="/demo-poster.jpg"
            aria-label="A console driven in natural language: the agent invites a teammate, searches users, renames a field through the DOM fallback and builds a React Flow workflow, with a status chip per tool call and an animated ring on every element it touches"
          >
            <source src="/demo.webm" type="video/webm" />
            <source src="/demo.mp4" type="video/mp4" />
          </video>
          <p class="demo-caption">
            The agent calls the same intents a human clicks, and{' '}
            <a href="/docs/recipes/local-model-copilot">
              <code>createCopilot({'{ visualize }'})</code>
            </a>{' '}
            is the whole of the feedback — chips, the gradient ring, the backdrop veil. Source:{' '}
            <a href="https://github.com/aralroca/Janux/tree/main/examples/with-web-agent">
              examples/with-web-agent
            </a>
            .
          </p>
        </section>

        <section class="two-faces">
          <h2>The same definition, seen by both audiences</h2>
          <div class="faces-grid">
            <div>
              <p class="face-label">😀 What you write</p>
              <div dangerHTML={code.html} />
            </div>
            <div>
              <p class="face-label">🤖 What agents see — generated, always in sync</p>
              <div dangerHTML={manifestJson.html} />
            </div>
          </div>
        </section>

        <section class="mission">
          <h2>Built for how software gets written now</h2>
          <p class="mission-lede">
            AI agents write the code. Humans review it. Agents operate the result. Janux is the
            first framework designed for that whole loop — not just the rendering.
          </p>
          <div class="mission-grid">
            <div>
              <h3>😶‍🌫️ Easy for agents to write</h3>
              <p>
                One schema-typed definition per component — no hooks, no lifecycle traps, no hidden
                state. The most predictable target a model can generate, right on the first try.
              </p>
            </div>
            <div>
              <h3>🔍 Easy for humans to review</h3>
              <p>
                State, actions, guards and view live in a single definition, so{' '}
                <strong>the PR is the whole truth of the component</strong>. Diffs read in minutes —
                no archaeology across files.
              </p>
            </div>
            <div>
              <h3>🤖 Easy for agents to operate</h3>
              <p>
                Every component ships as typed MCP tools and live resources — <strong>WebMCP</strong>{' '}
                in the browser, a hosted <strong>MCP endpoint</strong> on the server. Connecting
                Claude, ChatGPT or your own copilot is a URL, not an integration project.
              </p>
            </div>
          </div>
          <p class="mission-close">
            Contracts can't drift — they're generated from the code that renders, with human approval
            built in where it matters. <strong>No other framework ships this loop out of the box.</strong>
          </p>
        </section>

        <section class="features">
          {FEATURES.map(([icon, title, body]) => (
            <div key={title} class="feature-card">
              <span class="icon">{icon}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </section>

        <footer class="home-footer">
          <a href="https://www.npmjs.com/package/janux">npm</a>
          <a href="https://github.com/aralroca/Janux">GitHub</a>
          <a href="https://github.com/aralroca/Janux/issues/1">RFC 0001</a>
          <a href="/docs/more/examples">Examples</a>
          <a href="/playground">Playground</a>
          <span>
            MIT © Aral Roca — from the creator of <a href="https://brisa.build/" target="_blank" rel="noopener">Brisa</a>
          </span>
        </footer>
      </main>
      <DocsCopilot persist />
    </Layout>
  );
}
