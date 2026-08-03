# __APP_NAME__ — a content site agents can read natively

Markdown files in `content/posts/` with a typed frontmatter contract, rendered as a
site with **two faces**: pages for people, and for agents an `llms.txt` index, every
page as a clean `.md` projection, and a typed `api.site.search` tool that is the
same code as the search box in the UI.

```bash
bun install
bun run dev        # http://localhost:4321
```

No API key needed, ever: there is no model in this template — the agent surface is
projections and typed tools.

## The agent surface

| Surface | What an agent gets |
|---|---|
| `GET /llms.txt` | Every published page and every tool, with guards |
| `GET /posts/<slug>.md` | Any page back as clean markdown — no scraping |
| `api.site.search` | Typed search over title, summary, tags and body; drafts never leak |
| `api.site.subscribe` | Subscribe an email — refuses duplicates loudly |

Set `draft: true` in a post's header and it disappears from the index, the search
and `llms.txt` at once.

## Evals: the surface is tested, not promised

`evals/*.eval.json` replay agent tasks over HTTP — search hits, the draft that must
never leak (that is what the xylophone is for), and the validation walls:

```bash
bun run eval       # janux eval: exit code 0 = every scenario green
```

Wire that command into CI and your agent surface is a merge gate, exactly like
`bun test` is for your functions.

## Deploy

```bash
bun run build && bun run start   # any box with Bun
```

Or Vercel in one command after a one-time scaffold — see the
[deploying guide](https://janux.build/docs/recipes/deploying):

```bash
bun add @janux/vercel && bunx janux-vercel --include content   # once: writes vercel.json
vercel deploy                                                  # every time after
```
