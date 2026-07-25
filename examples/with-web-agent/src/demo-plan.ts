/**
 * The scripted planner standing in for a model, so the demo runs with zero
 * config and the same request always produces the same tour. Swap it for a real
 * one by handing `createCopilot` a `localLlm()` or `serverLlm()` — see copilot.ts.
 *
 * Manifest tool names arrive at the model sanitized (`users.search` →
 * `users_search`); `read_page` and `fill` are the DOM fallback, used only for the
 * display name, which no tool exposes.
 */
export interface PlannedCall {
  name: string;
  arguments: Record<string, unknown>;
}

/** The placeholder `fill` ref, resolved from the live page snapshot at call time. */
export const PENDING_REF = 'e?';

const WORKFLOW_STEPS = ['Trigger', 'Fetch data', 'Transform', 'Send notification'];
const BUILD_FLOW = /\b(build|create)\b/i;
const FLOW_WORDS = /\b(workflow|flow|pipeline)\b/i;
const ADD_STEP = /add\s+(?:a\s+)?(?:step\s+)?["“]?([\w \-]+?)["”]?\s*(?:step)?$/i;
const EMAIL = /([\w.+-]+@[\w-]+\.[\w.-]+)/;
const SEARCH = /(?:search|find|filter)\s+(?:for\s+|users?\s+)?(\w+)/i;
const RENAME = /(?:display name|name)\s+to\s+(.+)$/i;
const TAB = /\b(users|team|profile|workflows?)\b/i;

/** Acting on a tab that isn't on screen would be invisible, so the agent opens it first. */
const open = (tab: string): PlannedCall => ({ name: 'console_goToTab', arguments: { tab } });

function buildWorkflow(goal: string): PlannedCall[] | undefined {
  if (!FLOW_WORDS.test(goal) || !BUILD_FLOW.test(goal)) return undefined;

  return [
    open('workflows'),
    ...WORKFLOW_STEPS.map((label) => ({ name: 'workflow_addStep', arguments: { label } })),
  ];
}

function addStep(goal: string): PlannedCall[] | undefined {
  const match = /\bstep\b/i.test(goal) ? ADD_STEP.exec(goal) : null;

  if (!match) return undefined;

  return [open('workflows'), { name: 'workflow_addStep', arguments: { label: match[1]!.trim() } }];
}

function invite(goal: string): PlannedCall[] | undefined {
  const email = /\binvite\b/i.test(goal) ? EMAIL.exec(goal) : null;

  if (!email) return undefined;
  const role = /admin/i.test(goal) ? 'Admin' : /editor/i.test(goal) ? 'Editor' : 'Viewer';

  return [open('team'), { name: 'team_invite', arguments: { email: email[1], role } }];
}

function search(goal: string): PlannedCall[] | undefined {
  const match = SEARCH.exec(goal);

  return match ? [open('users'), { name: 'users_search', arguments: { value: match[1] } }] : undefined;
}

/** Nothing exposes the display name, so the agent reads the page and fills it. */
function rename(goal: string): PlannedCall[] | undefined {
  const match = /\bname\b/i.test(goal) ? RENAME.exec(goal) : null;

  if (!match) return undefined;

  return [
    { name: 'console_goToTab', arguments: { tab: 'profile' } },
    { name: 'read_page', arguments: {} },
    { name: 'fill', arguments: { ref: PENDING_REF, value: match[1]!.trim() } },
  ];
}

function goToTab(goal: string): PlannedCall[] | undefined {
  const match = TAB.exec(goal);

  if (!match) return undefined;
  const tab = match[1]!.toLowerCase().replace(/^workflow$/, 'workflows');

  return [{ name: 'console_goToTab', arguments: { tab } }];
}

const RULES = [buildWorkflow, addStep, invite, search, rename, goToTab];

/** The whole plan for a goal, in order. Empty when nothing matches. */
export function planFor(goal: string): PlannedCall[] {
  return RULES.reduce<PlannedCall[] | undefined>((plan, rule) => plan ?? rule(goal), undefined) ?? [];
}
