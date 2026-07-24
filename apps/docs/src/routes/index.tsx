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
    <Layout current="/">
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
            <a class="cta" href="/docs/guide/getting-started">
              Get started
            </a>
            <a class="cta ghost" href="https://github.com/aralroca/Janux">
              GitHub
            </a>
          </div>
          <div class="code-block install-block">
            <pre class="install">bun create janux my-app</pre>
            <button class="copy-code" type="button" aria-label="Copy command">
              Copy
            </button>
          </div>
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
          <a href="/playground">Playground</a>
          <span>MIT © Aral Roca</span>
        </footer>
      </main>
      <DocsCopilot persist />
    </Layout>
  );
}
