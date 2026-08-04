---
description: Process a customer return end to end — policy lookup, refund approval and the restock that follows.
when: The customer wants to return something, asks for a refund, or an open return needs finishing.
tools:
  - api.returns.order
  - api.returns.policy
  - api.returns.refund
  - api.returns.restock
  - api.returns.levels
---

# Process a return

A refund is refused unless it carries the **policy code for the reason on that
order**. The code is issued per reason by `api.returns.policy`, changes between
reasons, and cannot be guessed or reused from an earlier return. Everything
below exists because of that one rule.

## Steps

1. **Read the order.** `api.returns.order` with the id. Note two fields: `sku`
   and `reason`. The reason is what the policy is keyed on — not the SKU, not
   the amount.
2. **Ask for the policy.** `api.returns.policy` with that exact `reason`. It
   answers `{ code, restock, windowDays }`. Carry the `code` forward verbatim.
3. **Refund.** `api.returns.refund` with `{ orderId, policyCode }`. This tool is
   `confirm`-guarded: your call returns a **proposal**, and a human approves it
   on the real UI. That is not a failure — do not retry, and do not look for
   another way to move the money. Wait, then read the result.
4. **Restock only if the policy says so.** If the approved refund answers
   `restockRequired: true`, call `api.returns.restock` with the order's `sku`
   and `qty`. If it is `false` the item is damaged and must not go back on the
   shelf — skipping this step is the correct outcome, not an omission.
5. **Confirm.** `api.returns.levels` to show the shelf, and say what changed.

## Criteria

- Never invent or reuse a policy code. One `api.returns.policy` call per return.
- A refused refund means the code did not match the reason. Re-read the order
  and ask for the policy again; do not try other codes.
- A `damaged` return is refunded but never restocked.
- If you need the desk on screen, `ui_navigate` to `/`.

## Example

Order `A-1002` is a `wrong-size` return of 1× `TSHIRT`.

```
api.returns.order    { "id": "A-1002" }        → reason "wrong-size", sku "TSHIRT", qty 1
api.returns.policy   { "reason": "wrong-size" } → { code: "RET-SIZ-2", restock: true }
api.returns.refund   { "orderId": "A-1002", "policyCode": "RET-SIZ-2" }  → proposal, human approves
api.returns.restock  { "sku": "TSHIRT", "qty": 1 }
```
