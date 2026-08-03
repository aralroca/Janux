# __APP_NAME__ — a CRUD back office with a human in the loop

A customers desk where **who is asking changes what happens**. Routine work — adding
a customer, changing a plan — executes immediately for humans and agents alike. The
destructive one — deleting a customer — is `confirm`-guarded: an agent's call becomes
a proposal in the approvals inbox, and nothing happens until a human decides. Every
executed change lands in **one audit trail** that records the actor from the
invocation origin, not from a form field.

```bash
bun install
bun run dev        # http://localhost:4321
```

No API key needed: the right panel shows the live agent surface and can call any
tool *as an agent*, so you can watch a delete turn into a proposal without any model.

## The agent surface

| Tool | Guard | What it does |
|---|---|---|
| `api.customers.list` | auto | Every customer on file |
| `api.customers.create` | auto | Add a customer |
| `api.customers.update` | auto | Change a customer's plan |
| `api.customers.remove` | **confirm** | Delete a customer — proposal until a human approves |
| `api.customers.trail` | auto | The audit trail: what ran, and whether a human or an agent did it |

The same list is public at `/_janux/manifest` and `/llms.txt` — the mounted page IS
the surface, so it cannot drift from the UI.

## Evals: the surface is tested, not promised

`evals/*.eval.json` replay complete agent tasks over HTTP — the CRUD loop, the full
propose → approve → audited delete, and the validation walls — with no model and no key:

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
