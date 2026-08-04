---
description: A skill that names tools this app does not have.
when: Never — this file exists to be moved into src/skills/ by the e2e suite.
tools:
  - api.returns.reimburse
---

# The lie

Elsewhere this file would ship: it reads like a procedure, and nothing checks
it until a model tries `api.returns.reimburse` and finds out there is no such
tool. Here `janux verify` refuses the build, because the tool list is derived
from the mounted tree rather than written down twice.

The body lies too: `returns-desk.escalate` is not an intent this component has.
