export interface LlmsTxtConfig {
  title?: string;
  description?: string;
}

export interface LlmsTxtTool {
  name: string;
  description?: string;
  guard: string;
}

const PARAM_SEGMENT = /\[([^\]]+)\]/g;

function fillPattern(pattern: string, params: Record<string, unknown>): string | undefined {
  const names = [...pattern.matchAll(PARAM_SEGMENT)].map((match) => match[1]!);

  if (!names.every((name) => params[name] != null)) return undefined;

  return pattern.replace(PARAM_SEGMENT, (_, name) => encodeURIComponent(String(params[name])));
}

/** Expands a dynamic route pattern with each params record; records missing a param are dropped. */
export function expandPattern(pattern: string, paramsList: Array<Record<string, unknown>>): string[] {
  return paramsList
    .map((params) => fillPattern(pattern, params))
    .filter((path): path is string => path !== undefined);
}

const TOOLS_INTRO =
  'Server tools callable via `POST /_janux/api/<name>` (JSON body). ' +
  'Per-page tools and resources: `GET /_janux/manifest?path=<page>`.';

function toolLine(tool: LlmsTxtTool): string {
  const wire = tool.name.replace(/^api\./, '');
  const approval = tool.guard === 'confirm' ? ' (requires human approval)' : '';
  const description = tool.description ? `: ${tool.description}` : ':';

  return `- [${tool.name}](/_janux/api/${wire})${description}${approval}`;
}

/** Renders the llms.txt markdown index: title, pages and the agent tool surface. */
export function buildLlmsTxt(config: LlmsTxtConfig, pages: string[], tools: LlmsTxtTool[]): string {
  const blocks = [
    `# ${config.title ?? 'Janux app'}`,
    config.description ? `> ${config.description}` : undefined,
    pages.length > 0 ? `## Pages\n\n${pages.map((page) => `- [${page}](${page})`).join('\n')}` : undefined,
    tools.length > 0 ? `## Agent tools\n\n${TOOLS_INTRO}\n\n${tools.map(toolLine).join('\n')}` : undefined,
  ];

  return `${blocks.filter(Boolean).join('\n\n')}\n`;
}
