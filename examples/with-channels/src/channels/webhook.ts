import { webhookChannel } from '@janux/agent';

/**
 * `src/channels/webhook.ts` → `/_janux/channels/webhook`. The filesystem is the
 * declaration, exactly as it is for a route, a skill or a schedule; there is no
 * second place to register this.
 *
 * The secret is required. An unset one refuses every caller rather than leaving
 * a door open that spends model budget:
 *
 *     JANUX_WEBHOOK_SECRET=dev-secret bun dev
 *     curl -X POST localhost:4340/_janux/channels/webhook \
 *       -H "authorization: Bearer dev-secret" \
 *       -d '{"text":"what is on the board?"}'
 */
export default webhookChannel({ secret: process.env.JANUX_WEBHOOK_SECRET! });
