import { buildManifest, component, intent, organizationJsonLd, schema, int, type PageMeta } from 'janux';
import { Layout } from '../components/Layout';
import { renderMarkdown } from '../server/markdown';
import { absolute, HERO_POSTER, SOCIAL_DEFAULTS, SOCIAL_IMAGE } from '../site';

/* Kept under ~155 characters: past that, search results truncate the sentence
   and the category ("Agentic Web") is what must survive the cut. */
const DESCRIPTION =
  'The fullstack framework for the Agentic Web: one definition ships a live view for humans and typed MCP tools & resources for AI agents.';

export const meta: PageMeta = {
  title: 'Janux — the fullstack framework for the Agentic Web',
  description: DESCRIPTION,
  canonical: '/',
  image: SOCIAL_IMAGE,
  og: { ...SOCIAL_DEFAULTS, type: 'website' },
  jsonLd: [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'Janux',
      url: absolute('/'),
      description: DESCRIPTION,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareSourceCode',
      name: 'Janux',
      description: DESCRIPTION,
      codeRepository: 'https://github.com/aralroca/Janux',
      programmingLanguage: 'TypeScript',
      license: 'https://opensource.org/licenses/MIT',
      author: { '@type': 'Person', name: 'Aral Roca Gómez', url: 'https://aralroca.com' },
    },
    organizationJsonLd({
      name: 'Janux',
      url: absolute('/'),
      logo: absolute('/favicon.svg'),
      sameAs: ['https://github.com/aralroca/Janux'],
    }),
  ],
  // The hero video's poster is the largest paint on this page; without the hint
  // the browser only discovers it after parsing the <video>. It is the poster,
  // not the social card: preloading an image only crawlers fetch would spend
  // the page's first connection on bytes the visitor never sees.
  head: [{ tag: 'link', attrs: { rel: 'preload', as: 'image', href: HERO_POSTER, fetchpriority: 'high' } }],
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
        <button onClick={intents.inc}
          class="rounded-xl bg-blue-600 px-6 py-2.5 font-bold text-white
                 shadow-lg shadow-blue-600/30 hover:bg-blue-700">
          +1
        </button>
        <button onClick={intents.reset}
          class="rounded-xl border border-neutral-300 px-6 py-2.5
                 font-semibold text-neutral-500 hover:border-neutral-400">
          Reset
        </button>
      </div>
    </section>
  ),
});`;

/* These two sit side by side in half the page, which is ~56 monospace columns.
   Every line stays under that — a marketing snippet you have to scroll
   sideways is a snippet nobody reads. The imports live in the captions. */
const WEBMCP_CODE = `export const Cart = component({
  name: 'cart',
  state: schema({ items: list({ sku: str() }) }),
  intents: {
    add: intent({
      description: 'Add a product to the cart',
      input: schema({ sku: str() }),
      run: ({ state, input }) => state.items.push(input),
    }),
  },
  view: ({ state }) => <b>{state.items.length}</b>,
});`;

const API_CODE = `export const refund = api({
  description: 'Refund an order. Irreversible.',
  input: schema({ orderId: str(), amount: money() }),
  guard: 'confirm',
  run: ({ input }) => payments.refund(input),
});`;

const INTEROP_CODE = `import { foreign } from 'janux/interop';
import { ReactFlow } from '@xyflow/react';

const Flow = foreign(ReactFlow, {
  props: (own) => ({ nodes: own.state.nodes }),
  on: { onNodeDrag: 'moveNode' },
  hydrate: 'visible',
});`;

/** The hero's install pill, reused verbatim by the MCP section. */
function CommandPill({ command }: { command: string }) {
  return (
    <div class="code-block install-block">
      <pre class="install">{command}</pre>
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
  );
}

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
  const webmcpCode = await renderMarkdown('```tsx\n' + WEBMCP_CODE + '\n```');
  const apiCode = await renderMarkdown('```ts\n' + API_CODE + '\n```');
  const interopCode = await renderMarkdown('```tsx\n' + INTEROP_CODE + '\n```');

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
          <p class="eyebrow">The fullstack framework for the Agentic Web</p>
          <h1>
            One component. <span class="gradient">Two faces.</span>
          </h1>
          <p class="tagline">
            The web has a second audience. Write one definition and ship both: a live view for
            humans, typed MCP tools &amp; resources for AI agents — generated together, so they can
            never drift.
          </p>
          <p class="hero-credit">
            From the creator of{' '}
            <a href="https://brisa.build/" target="_blank" rel="noopener">
              Brisa
            </a>
          </p>
          <div class="hero-actions">
            <a class="cta" href="/docs/getting-started/quick-start">
              Get started
            </a>
            <a class="cta ghost" href="https://github.com/aralroca/Janux">
              GitHub
            </a>
          </div>
          <CommandPill command="bun create janux my-app" />
          <p class="hero-note">
            <code>bunx create-janux my-app</code> is the same command. Requires{' '}
            <a href="https://bun.sh" target="_blank" rel="noopener">
              Bun
            </a>{' '}
            ≥ 1.3 — the dev server, the build and the production server all run on it.
          </p>
        </section>

        <section class="demo">
          <video
            autoplay
            muted
            loop
            playsInline
            controls
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

        <section class="pitch split">
          <div dangerHTML={interopCode.html} />
          <div class="pitch-copy">
            <h2 class="pitch-title">
              A better model. Without giving up the{' '}
              <span class="gradient">React&nbsp;ecosystem</span>.
            </h2>
            <p class="pitch-lede">
              Nobody rewrites their stack for a new framework, and you don't have to.{' '}
              <code>foreign()</code> mounts any React component <strong>unchanged</strong> — in a
              real embedded React root, inside a Janux view. React Flow, data grids, animation
              libraries, PDF viewers: they keep working.
            </p>
            <p class="code-caption">
              Wrap it once in a bifacial shell and the opaque widget becomes agent-drivable too. And{' '}
              <code>react</code> stays an optional peer:{' '}
              <strong>an app with no foreign island ships zero React</strong>.
            </p>
            <p class="pitch-links">
              <a href="/docs/guide/interop">Interop guide →</a>
              <a href="https://github.com/aralroca/Janux/tree/main/examples/interop-react">
                examples/interop-react →
              </a>
            </p>
          </div>
        </section>

        <section class="pitch surfaces">
          <h2 class="pitch-title">
            Ship an <span class="gradient">MCP&nbsp;server</span>. Get{' '}
            <span class="gradient">WebMCP</span> for free.
          </h2>
          <p class="pitch-lede">
            The Agentic Web has two surfaces, and Janux ships both with no integration work: the one
            every MCP client already speaks comes out of your server functions, the browser one out
            of your components. You define neither. <code>llms.txt</code>, Markdown projections of
            every page and Web Bot Auth identity come along with them.
          </p>
          <p class="pitch-note">
            Pointing Claude, Cursor or any MCP client at your app takes a URL, not an integration
            project — and it works today:
          </p>
          <CommandPill command="claude mcp add --transport http my-app https://your.app/_janux/mcp" />
          <div class="faces-grid">
            <div>
              <p class="face-label">🔌 MCP server — tools over HTTP</p>
              <div class="pitch-code" dangerHTML={apiCode.html} />
              <p class="code-caption">
                <code>api</code> comes from <code>@janux/server</code>. One definition is a
                validated endpoint, a ~100-byte client stub <em>and</em> a tool on your app's MCP
                server at <code>/_janux/mcp</code> — where <code>guard: 'confirm'</code> reaches
                clients as <code>annotations.requiresApproval</code>.
              </p>
            </div>
            <div>
              <p class="face-label">🌐 WebMCP — the same tools, in the browser</p>
              <div class="pitch-code" dangerHTML={webmcpCode.html} />
              <p class="code-caption">
                <code>component</code>, <code>intent</code> and <code>schema</code> come from{' '}
                <code>janux</code>. Every intent is registered with{' '}
                <code>document.modelContext</code> the moment the island mounts, so Chrome's agent
                and the DevTools WebMCP panel see it — and the button a human clicks runs that same
                code.
              </p>
            </div>
          </div>
          <p class="pitch-links">
            <a href="/docs/getting-started/the-agentic-web">The Agentic Web →</a>
            <a href="/docs/guide/api-rpc">api() reference →</a>
            <a href="/docs/recipes/external-mcp-clients">External MCP clients →</a>
            <a href="/docs/guide/agent-and-copilot">Agent &amp; copilot →</a>
            <a href="/docs/recipes/debugging-webmcp">Debugging WebMCP →</a>
          </p>
        </section>

        <section class="mission">
          <h2>Built for the Agentic Web</h2>
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
                Every app ships a hosted <strong>MCP endpoint</strong> on the server, and every
                component its tools as <strong>WebMCP</strong> in the browser. Connecting Claude,
                ChatGPT or your own copilot is a URL, not an integration project.
              </p>
            </div>
          </div>
          <p class="mission-close">
            Contracts can't drift — they're generated from the code that renders, with human approval
            built in where it matters. <strong>No other framework ships this loop out of the box.</strong>
          </p>
        </section>

        <section class="scores">
          {/* Barely moving, so it reads as a picture rather than a video: no
              controls, no chrome. There is a recording per theme, but rendering
              both `<video>`s downloaded both (a hidden video still fetches its
              poster and metadata), so the still frame is the container's
              background — one image, resolved by the cascade — and `setupScoresVideo`
              gives the single element the source that matches. Without JS, or with
              reduced motion, the still is all there is, which is the whole point. */}
          <div class="scores-video">
            <video
              autoplay
              muted
              loop
              playsInline
              preload="none"
              width="1008"
              height="286"
              data-light="/lighthouse-100-light.mp4"
              data-dark="/lighthouse-100-dark.mp4"
              aria-label="Lighthouse report for the Janux documentation: 100 in performance, accessibility, best practices, SEO and agentic browsing"
            ></video>
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
          <a href="/docs/more/examples">Examples</a>
          <a href="/playground">Playground</a>
          <span>MIT © Aral Roca</span>
        </footer>
      </main>
    </Layout>
  );
}
