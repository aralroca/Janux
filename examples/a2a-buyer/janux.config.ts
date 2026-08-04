import { defineConfig } from 'janux';

/**
 * The buyer is an agent too: it publishes its own card, and hires the supplier
 * through theirs. `SUPPLIER_URL` is the only thing it knows about the supplier
 * — everything else it reads from the card.
 */
export default defineConfig({
  title: 'Workshop Buyer',
  llmsTxt: { description: 'Buys parts from a supplier agent over A2A.' },
  siteUrl: process.env.BUYER_URL,
});
