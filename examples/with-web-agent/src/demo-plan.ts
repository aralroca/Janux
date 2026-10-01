/**
 * The scripted planner standing in for a model, so the demo runs with zero
 * config and the same request always produces the same tour. Swap it for a real
 * one by handing `createCopilot` a `localLlm()` or `serverLlm()` — see copilot.ts.
 *
 * Manifest tool names arrive at the model sanitized (`users.search` →
 * `users_search`); `read_page`, `fill` and `drag` are the DOM fallback, used for
 * the display name, which no tool exposes, and for dragging cards on the board.
 */
export interface PlannedCall {
  name: string;
  arguments: Record<string, unknown>;
}

/** A placeholder ref, resolved at call time from the live page snapshot line naming `name`. */
export const PENDING_REF = 'e?';
const pending = (name: string) => `${PENDING_REF}${name}`;

/** What this planner knows how to do — the panel's suggestions and its greeting. */
export const EXAMPLE_GOALS = [
  'invite jane@acme.com as admin',
  'search Kenji',
  'change my display name to Neo',
  'build a workflow',
  'move Fix login redirect to Done',
];

const WORKFLOW_STEPS = ['Trigger', 'Fetch data', 'Transform', 'Send notification'];
const BUILD_FLOW = /\b(build|create)\b/i;
const FLOW_WORDS = /\b(workflow|flow|pipeline)\b/i;
const ADD_STEP = /add\s+(?:a\s+)?(?:step\s+)?["“]?([\w \-]+?)["”]?\s*(?:step)?$/i;
const EMAIL = /([\w.+-]+@[\w-]+\.[\w.-]+)/;
const SEARCH = /(?:search|find|filter)\s+(?:for\s+|users?\s+)?(\w+)/i;
const RENAME = /(?:display name|name)\s+to\s+(.+)$/i;
const MOVE = /\bmove\s+["“]?(.+?)["”]?\s+to\s+(todo|in progress|done)\b/i;
const COLUMNS: Record<string, string> = { todo: 'Todo', 'in progress': 'In progress', done: 'Done' };
const TAB = /\b(users|team|profile|workflows?|board)\b/i;

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
  const match = RENAME.exec(goal);

  if (!match) return undefined;

  return [
    open('profile'),
    { name: 'read_page', arguments: {} },
    { name: 'fill', arguments: { ref: pending('Display name'), value: match[1]!.trim() } },
  ];
}

/** Nothing exposes moving a card either: the agent drags it, as a hand would. */
function move(goal: string): PlannedCall[] | undefined {
  const match = MOVE.exec(goal);

  if (!match) return undefined;

  return [
    open('board'),
    { name: 'read_page', arguments: {} },
    { name: 'drag', arguments: { ref: pending(match[1]!.trim()), to: pending(COLUMNS[match[2]!.toLowerCase()]!) } },
  ];
}

function goToTab(goal: string): PlannedCall[] | undefined {
  const match = TAB.exec(goal);

  return match ? [open(match[1]!.toLowerCase().replace(/^workflow$/, 'workflows'))] : undefined;
}

const RULES = [buildWorkflow, addStep, invite, search, rename, move, goToTab];

/** The whole plan for a goal, in order. Empty when nothing matches. */
export function planFor(goal: string): PlannedCall[] {
  return RULES.reduce<PlannedCall[] | undefined>((plan, rule) => plan ?? rule(goal), undefined) ?? [];
}
