---
"@janux/server": minor
"@janux/agent": minor
"@janux/vite": minor
"@janux/cli": minor
"janux": minor
---

Skills: procedures the model loads on demand. Drop a markdown file in `src/skills/` — `refund.md`, or `refund/SKILL.md` when it will grow siblings — with a `description` and, optionally, `when` to reach for it and the `tools` it uses. Frontmatter is validated by the same `schema()` that types component state.

The split is the point. The index (name, description, when) rides in every manifest, small enough to always be in context; the body is fetched one at a time. The built-in copilot gets a `load_skill` tool for it, and external clients get the same contract over MCP, where the resource list is the index and `resources/read` on `janux://skill/<name>` is the body. Loading a skill is a read: it invokes nothing, and the tools a procedure describes are still called through the invocation pipeline with their guards.

`janux verify` now holds a skill to the mounted tree. Every tool it declares in frontmatter, or writes down in its prose and worked examples, has to be a tool the app really has — otherwise the check fails, naming the skill and the file. A skill that names a tool nobody implemented is a mistake other frameworks can only find at runtime.

See the [skills guide](https://janux.build/docs/guide/skills) and `examples/with-skills`.
