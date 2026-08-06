# @janux/content

## 0.7.0

## 0.6.0

### Minor Changes

- Released with the rest of the workspace.

  `PUBLISH_ORDER` publishes ten packages and `scripts/version.ts` requires the
  ten to agree on one version, but the `fixed` group in `.changeset/config.json`
  still named the eight that existed when it was written — so nothing bumped
  these two along and the release refused to cut. Both are in the group now,
  and every package added from here has to join it.
