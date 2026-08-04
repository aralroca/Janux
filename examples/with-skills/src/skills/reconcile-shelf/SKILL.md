---
name: reconcile-shelf
description: Check the shelf against the returns that were approved, and report what is missing.
when: Someone asks whether the stock counts are right, or why a returned item never came back.
tools:
  - api.returns.orders_list
  - api.returns.levels
---

# Reconcile the shelf

The packaged form of a skill: a directory with a `SKILL.md`, for procedures
that will grow siblings (references, fixtures) later.

## Steps

1. `api.returns.orders_list` — every return and its status.
2. `api.returns.levels` — what is on the shelf now.
3. A `refunded` return whose reason is resellable (`wrong-size`,
   `changed-mind`) should have added its `qty` back. A `damaged` one should
   not have.
4. Report the difference per SKU. Do not restock anything to "fix" it — say
   what is off and let a human decide.
