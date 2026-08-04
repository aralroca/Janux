# Skills — procedures the model loads on demand

A returns desk with one rule that no tool description has room to teach: **a refund is refused unless it carries the policy code for the reason on that order**, and the code is issued per reason, so it can never be guessed. That rule, the order of the steps, and what to do when the refund comes back as a proposal live in `src/skills/process-return.md` — a markdown file the framework discovers exactly the way it discovers a route.

- **The filesystem is the declaration** — `src/skills/process-return.md` (flat) and `src/skills/reconcile-shelf/SKILL.md` (packaged, for procedures that will grow siblings). Frontmatter is validated by the same `schema()` that types component state, so a skill with no description stops the boot instead of shipping an index line nobody can route on.
- **Loaded on demand** — the model always sees the index (name, description, when to use it: ~600 characters for both skills). It sees the 2 KB body of `process-return` only after it calls `load_skill`, and only for the one it asked for. That is the whole point: a procedure nobody needs this turn costs one line.
- **A read, never a channel** — `load_skill` returns markdown. The tools the procedure names are still invoked through the same pipeline with the same guards, so `api.returns.refund` still returns a proposal a human approves. A skill cannot grant itself a permission by describing one.
- **Projected to every client** — the same index rides in `/_janux/manifest` and in the hosted MCP endpoint, where the resource *list* is the index and `resources/read` on `janux://skill/<name>` is the body. An external MCP client gets the same on-demand contract as the built-in copilot, spoken in the protocol it already implements.
- **`janux verify` refuses a skill that lies** — every tool a procedure declares in frontmatter *or* writes down in its prose and worked example has to be a tool the mounted tree actually has. Elsewhere a skill is prose and the first thing that finds out is a live agent.

```bash
bun install
bun run dev   # http://localhost:4322
bunx janux verify
bunx janux eval --json
```

## The evals

`evals/` replays the task over the real agent surface with no model anywhere, so it is a CI gate:

- `return-following-the-skill.eval.json` — the whole procedure in the order the skill prescribes: read the order, ask for the policy, refund (a proposal), approve it as a human, restock, confirm the shelf. Passes.
- `return-without-the-procedure.eval.json` — the same return with a guessed policy code. The proposal parks, the approval fails, and the order is still `open` with the stock untouched. This is the half that makes the skill worth shipping: the surface alone does not carry the knowledge.

`model-evals/agent-follows-the-skill.eval.json` is the same task driven by a real model (`turn` steps), asserting that the agent finishes the return end to end. It lives outside the `evals/` glob on purpose, because a keyless run cannot reach a model and "could not run" must never read as "passed":

```bash
JANUX_MODEL="anthropic/claude-sonnet-5" ANTHROPIC_API_KEY=… \
  bunx janux eval model-evals/agent-follows-the-skill.eval.json --start "bunx janux start --port 4322" --url http://localhost:4322
```

## The canary

`broken-skills/lies.md` is a skill that names `api.returns.reimburse` in its frontmatter and `returns-desk.escalate` in its prose. Neither exists. Copy it into `src/skills/` and `janux verify` exits 1 naming both:

```bash
cp broken-skills/lies.md src/skills/ && bunx janux verify; rm src/skills/lies.md
```

The e2e suite does exactly that. Green means something because red is proven reachable.
