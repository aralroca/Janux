# __APP_NAME__ — an ops dashboard with a copilot that drives the UI

Incident triage where the copilot is a real operator, not a chat widget: it reads the
board through `api.ops.board`, acknowledges and resolves incidents with the **same
tools the buttons call**, and when it reaches for the customer-visible switch —
maintenance mode — the `confirm` guard turns its call into a proposal only you can
approve.

```bash
bun install
bun run dev        # http://localhost:4321
```

## No API key? Still works

Without `JANUX_MODEL` (or a provider key) the app boots, every button works, and the
copilot answers with a setup card instead of failing. The **“▶ Demo without API key”**
chip replays a scripted triage with real tool calls through the real bridge — no model
anywhere. When you are ready:

```bash
cp .env.example .env   # set JANUX_MODEL or one provider API key
```

## The agent surface

| Tool | Guard | What it does |
|---|---|---|
| `api.ops.board` | auto | Maintenance state + every incident |
| `api.ops.acknowledge` | auto | Take ownership of an open incident |
| `api.ops.resolve` | auto | Resolve an acknowledged incident |
| `api.ops.maintenance` | **confirm** | Flip the whole site into maintenance mode |

The same list is public at `/_janux/manifest` and `/llms.txt` — the mounted page IS
the surface, so it cannot drift from the UI.

## Evals: the surface is tested, not promised

`evals/*.eval.json` replay complete agent tasks over HTTP — triage, the
maintenance-mode approval flow, and the validation walls — with no model and no key:

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
bun add @janux/vercel && bunx janux-vercel   # once: writes vercel.json
vercel deploy                                # every time after
```
