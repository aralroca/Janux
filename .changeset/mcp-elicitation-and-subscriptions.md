---
"@janux/server": minor
---

MCP elicitation and resource subscriptions: the parts of the 2026-07-28 spec that Janux already had the machinery for.

`guard: 'confirm'` has always parked a proposal for a human. The protocol has a word for that now, so the endpoint speaks it. A `confirm`-guarded `tools/call` from a client that declares `elicitation.url` answers `input_required` with an `elicitation/create` request in `url` mode, pointing at a page on the app's own origin that shows the tool and the exact input; a human approves there and the client's retry collects the result. It is the spec's multi round-trip pattern, which needs no session and no sticky routing — the same reason Janux was already stateless.

`url` mode and not `form` on purpose: form mode would have the MCP client collect the approval, which is the one decision that must not be made there. The approval runs through the pipeline it always did, so the audit trail gets the same `origin: 'human'` entry, wrapping the same agent-origin execution, and the `requestState` the client carries between attempts is the proposal token — HMAC-signed over id, payload and session, so a client that edits it gets a refusal instead of someone else's proposal.

This also closes a hole rather than only adding a feature: a `confirm` tool called over MCP could not be approved by a human at all. The proposal bound to the *proposer's* cookie session and an external client has no cookie, so the signature could only ever match a cookieless approver — which is to say the agent itself. Proposals parked through the hosted endpoint now settle out of band, by the token, from a human on their own session.

`subscriptions/listen` (which replaced `resources/subscribe` and the GET stream Janux answers with 405) opens an SSE stream for the life of one POST: it acknowledges with the subset it will honor, then sends `notifications/resources/updated` when a watched page's cached response is invalidated — `revalidatePath()` is exactly "that page's projection changed" — and releases the watch when the stream ends, whichever way it ends.

Both are modern-era only. A client on an older version keeps the `initialize` handshake, the `status: "proposal"` payload and capabilities without `subscribe`, and the suite pins that against the official MCP SDK, which negotiates `2025-11-25` and is therefore the era that must not move.

Sampling and roots are not implemented, and the [coverage table](https://janux.build/docs/recipes/external-mcp-clients) says so along with everything else that is missing: a Janux app brings its own models rather than borrowing the client's, and a web app has nothing to do with the client's filesystem.
