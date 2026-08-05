import { safeAttr } from './html-escape';
import { PAGE_STYLE } from './mcp-landing';

/**
 * Where a URL-mode elicitation sends the human.
 *
 * An MCP client cannot show what a `confirm` guard is guarding — it has the
 * tool's name and nothing else — and it must not be the one collecting the
 * decision either. So the server hands it a URL and the decision happens here,
 * on the app's own origin, showing the tool and the exact input that will run.
 *
 * Plain form, no script: the page inherits whatever CSP the app serves, and a
 * settlement that works with JavaScript off is one less thing between a human
 * and a decision that has already been parked once.
 */

const SETTLE_PATH = '/_janux/elicit/settle';

const FORM_STYLE = `
  .row { display: flex; gap: 10px; margin-top: 24px }
  button { flex: 1; padding: 11px 16px; border-radius: 10px; border: 1px solid var(--line);
           background: var(--soft); color: var(--fg); font: inherit; font-size: 14px; cursor: pointer }
  button.approve { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600 }
  dl { margin: 0; padding: 0 }
  dt { color: var(--muted); font-size: 13px; letter-spacing: .04em; text-transform: uppercase; margin-top: 18px }
  dd { margin: 6px 0 0 }
`;

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeAttr(title)}</title><style>${PAGE_STYLE}${FORM_STYLE}</style></head>
<body><main>${body}</main></body></html>`;
}

/** JSON a human reads, escaped as text — never as markup. */
function inputBlock(input: unknown): string {
  return `<pre>${safeAttr(JSON.stringify(input, null, 2) ?? 'null')}</pre>`;
}

export function elicitPage(serverName: string, token: string, proposal: { tool: string; input: unknown }): string {
  return page(
    `Approve ${proposal.tool}?`,
    `<h1>Approve this call?</h1>
<p>An agent connected to <strong>${safeAttr(serverName)}</strong> asked to run a tool that needs a human first. Nothing has run yet.</p>
<dl><dt>Tool</dt><dd><code>${safeAttr(proposal.tool)}</code></dd>
<dt>Input</dt><dd>${inputBlock(proposal.input)}</dd></dl>
<form method="post" action="${SETTLE_PATH}">
<input type="hidden" name="token" value="${safeAttr(token)}">
<div class="row">
<button class="approve" type="submit" name="decision" value="approve">Approve and run it</button>
<button type="submit" name="decision" value="reject">Reject</button>
</div></form>
<footer>Approving runs the call once, exactly as shown. The agent collects the outcome on its next attempt.</footer>`,
  );
}

/** What the human sees after deciding — the agent is told separately, on its own retry. */
export function elicitSettledPage(decision: 'approve' | 'reject'): string {
  const approved = decision === 'approve';

  return page(
    approved ? 'Approved' : 'Rejected',
    `<h1>${approved ? 'Approved' : 'Rejected'}</h1>
<p>${approved ? 'The call ran. The agent that proposed it collects the result on its next attempt.' : 'Nothing ran, and the proposal is gone. The agent is told it was refused.'}</p>
<footer><a href="/">Back to the app</a></footer>`,
  );
}

/** An expired, settled or forged token — the same answer for all three, on purpose. */
export function elicitGonePage(): string {
  return page(
    'Nothing to approve',
    `<h1>Nothing to approve</h1>
<p>This proposal has already been settled, or it expired, or the link is not one this server issued. Ask the agent to try again.</p>
<footer><a href="/">Back to the app</a></footer>`,
  );
}
