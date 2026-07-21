export interface ResolvedModel {
  provider: 'anthropic' | 'openai' | 'google';
  model: string;
  apiKey: string;
  source: string;
}

export interface ModelEnv {
  [key: string]: string | undefined;
}

const PROVIDER_KEYS: Record<ResolvedModel['provider'], string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
};

const DEFAULT_MODELS: Record<ResolvedModel['provider'], string> = {
  anthropic: 'claude-sonnet-5',
  openai: 'gpt-5.2',
  google: 'gemini-3-pro',
};

function fromIdentifier(identifier: string, env: ModelEnv, source: string): ResolvedModel | undefined {
  const [provider, ...rest] = identifier.split('/') as [ResolvedModel['provider'], ...string[]];
  const apiKey = env[PROVIDER_KEYS[provider] ?? ''];

  if (!PROVIDER_KEYS[provider] || rest.length === 0) return undefined;
  if (!apiKey) return undefined;

  return { provider, model: rest.join('/'), apiKey, source };
}

function sniffProvider(env: ModelEnv): ResolvedModel | undefined {
  const available = (Object.keys(PROVIDER_KEYS) as ResolvedModel['provider'][]).filter(
    (provider) => env[PROVIDER_KEYS[provider]],
  );
  const provider = available[0];

  if (!provider) return undefined;

  return {
    provider,
    model: DEFAULT_MODELS[provider],
    apiKey: env[PROVIDER_KEYS[provider]]!,
    source: `inferred from ${PROVIDER_KEYS[provider]}`,
  };
}

/**
 * RFC §8.1 resolution order: explicit code → JANUX_MODEL env → provider key
 * sniffing → undefined (the app still boots; the agent answers with a setup card).
 */
export function resolveModel(explicit: string | undefined, env: ModelEnv): ResolvedModel | undefined {
  if (explicit) return fromIdentifier(explicit, env, 'defineAgent({ model })');
  if (env.JANUX_MODEL) return fromIdentifier(env.JANUX_MODEL, env, 'JANUX_MODEL');

  return sniffProvider(env);
}

export function setupCard(): Record<string, unknown> {
  return {
    type: 'setup',
    message:
      'No model configured. Set JANUX_MODEL="provider/model" or one provider API key ' +
      `(${Object.values(PROVIDER_KEYS).join(', ')}).`,
  };
}
