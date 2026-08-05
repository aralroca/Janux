import { LOAD_SKILL } from '../skills';
import { DELEGATE_PREFIX } from '../subagents';
import { HANDOFF_PREFIX } from '../handoff';

/**
 * What the agent still has when there is no browser.
 *
 * A channel does not change the loop; it changes what the loop can reach. The
 * browser half of the surface — `ui_*` and the page's own intents — is executed
 * by the client, which on Slack, Discord or a webhook is nobody. So the tools
 * that need a DOM are not offered, and the model is told which ones they were:
 * a copilot that knows it cannot open the cart page will say so, while one that
 * is silently short a tool will invent a way to have used it.
 *
 * The predicate below is the same partition the loop dispatches on — `api.*`,
 * skills, delegation, handoff and outbound MCP are answered by the server;
 * everything else travels to the client — so the offered surface and the
 * executed surface cannot drift apart.
 */

/** Whether the server answers this tool itself, with no client in the loop. */
export function serverAnswered(name: string, ownsRemote: (name: string) => boolean): boolean {
  return (
    name.startsWith('api.') ||
    name === LOAD_SKILL ||
    name.startsWith(DELEGATE_PREFIX) ||
    name.startsWith(HANDOFF_PREFIX) ||
    ownsRemote(name)
  );
}

/**
 * The paragraph appended to the system prompt on a channel turn. `withheld` is
 * never empty — the `ui_*` specs are part of every browser surface — so there
 * is no "you have everything" case to write.
 */
export function channelNote(channel: string, withheld: readonly string[]): string {
  return [
    `This turn arrives over the "${channel}" channel, not a browser: there is no page to read, click or navigate.`,
    `Not available here: ${withheld.join(', ')}. Calling one of them runs nothing.`,
    'Use the tools you do have, and when a request genuinely needs the UI, say so plainly instead of implying you acted.',
  ].join(' ');
}

/**
 * The answer to a browser tool called anyway. A structured result rather than a
 * thrown error, because the turn should end in a sentence the human can read —
 * the model has to learn what happened, not have the call fail under it.
 */
export function unavailableOnChannel(tool: string, channel: string): Record<string, string> {
  return {
    error: 'tool_unavailable_on_channel',
    tool,
    channel,
    message: `"${tool}" drives the browser UI and this turn is on the "${channel}" channel, so nothing ran. Answer with the tools you have, or say that this needs the app open.`,
  };
}
