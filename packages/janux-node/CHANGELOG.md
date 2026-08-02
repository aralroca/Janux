# @janux/node

## 0.6.0

### Minor Changes

- Released with the rest of the workspace.

  `PUBLISH_ORDER` publishes ten packages and `scripts/version.ts` requires the
  ten to agree on one version, but the `fixed` group in `.changeset/config.json`
  names only eight — these two are outside it, so nothing bumps them along and
  the release refuses to cut. Until the config lists all ten, they ride each
  release explicitly.
