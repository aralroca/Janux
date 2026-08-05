import type { ChannelDef } from '@janux/server';

export { webhookChannel, type WebhookChannelOptions } from './webhook';
export { slackChannel, type SlackChannelOptions } from './slack';
export { discordChannel, type DiscordChannelOptions } from './discord';

/**
 * A channel, typed — identity at runtime, exactly like `defineSchedule`. What
 * `src/channels/<name>.ts` default-exports is what `/_janux/channels/<name>`
 * mounts.
 */
export function defineChannel(def: ChannelDef): ChannelDef {
  return def;
}
