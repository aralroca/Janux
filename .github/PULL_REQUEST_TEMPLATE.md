<!-- What changes, and why. If it touches the component model, link the RFC
     section: RFC 0001 (#1) / RFC 0002 (#13). -->

## Checklist

CI checks all of this — going through it locally saves a round trip:

- [ ] `bun run test` passes (bug fixes reproduce the bug in a test first)
- [ ] `bun run typecheck` passes (covers `packages/*` and `examples/*`)
- [ ] Docs updated if behavior or public API changed — code fences must compile (`packages/docs-tests`)
- [ ] Changeset added if a published package changed (`bun run changeset`); docs, examples and CI need none
- [ ] New example? Listed in `README.md` and `apps/docs/content/more/examples.md`, with a dedicated e2e suite — see [Adding an example](https://github.com/aralroca/Janux/blob/main/CONTRIBUTING.md#adding-an-example)
