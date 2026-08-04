import { defineConfig } from 'janux';

/**
 * Two fields the agent card is derived from: the app's name, and the one-line
 * description it already publishes for `llms.txt`. Neither is written twice.
 *
 * `siteUrl` is what the card advertises as its endpoint. Left unset, the card
 * names the origin each request arrived on — right everywhere except behind a
 * proxy that rewrites it. Set `SUPPLIER_URL` to the public origin then.
 */
export default defineConfig({
  title: 'Parts Supplier',
  llmsTxt: { description: 'Quotes and ships parts. Shipping needs a human here to approve it.' },
  siteUrl: process.env.SUPPLIER_URL,
});
