import { publishJanuxError, type JanuxErrorChain } from './error-channel';
import type { ComponentDef, EffectDef, SourceDef } from '../define/types';

/**
 * Dev only. Wraps a component's declared effect and source bodies so a failure
 * arrives on the error channel knowing its own name.
 *
 * Intents publish from the invocation pipeline instead (`runtime/intents.ts`),
 * because only the pipeline knows the origin and the guard it resolved for that
 * caller. Effects and sources have no caller: naming them is the whole story.
 *
 * Everything here is reached through `import.meta.env?.DEV`, so a production
 * build never imports this module.
 */

/** Publishes the failure, then rethrows the original — sync and async bodies alike. */
function traced<Args extends unknown[], Result>(
  run: (...args: Args) => Result,
  chain: JanuxErrorChain,
): (...args: Args) => Result {
  const explain = (error: unknown): never => {
    publishJanuxError(error, chain);
    throw error;
  };

  return (...args: Args) => {
    try {
      const result = run(...args);

      return result instanceof Promise ? (result.catch(explain) as Result) : result;
    } catch (error) {
      return explain(error);
    }
  };
}

function tracedEffects(defs: ComponentDef['effects'], component: string, island: string) {
  return (
    defs &&
    Object.fromEntries(
      Object.entries(defs).map(([name, def]): [string, EffectDef] => [
        name,
        { ...def, run: traced(def.run, { kind: 'effect', component, name, island }) },
      ]),
    )
  );
}

function tracedSources(defs: ComponentDef['sources'], component: string, island: string) {
  return (
    defs &&
    Object.fromEntries(
      Object.entries(defs).map(([name, def]): [string, SourceDef] => [
        name,
        { ...def, query: traced(def.query, { kind: 'source', component, name, island }) },
      ]),
    )
  );
}

/** A shallow clone of `def` whose effects and sources explain themselves when they throw. */
export function traceDef(def: ComponentDef, island: string): ComponentDef {
  const effects = tracedEffects(def.effects, def.name, island);
  const sources = tracedSources(def.sources, def.name, island);

  return { ...def, ...(effects && { effects }), ...(sources && { sources }) };
}
