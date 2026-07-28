import { boot } from 'janux/client';
import { installStoreSelectorStress } from '../../../../store-selector-fanout/shared.js';
import { SelectorPanel } from './App';

const stress = installStoreSelectorStress();
const client = boot({ defs: [SelectorPanel], navigation: false, webmcp: false });
const instance = await client.mount('selector#1');

// The harness drives N discrete parent renders through these: `bump` runs the
// intent, `flush` drains the intent microtask chain plus the synchronous
// morph it triggers (Janux's public flush is `settled()`).
stress.bump = () => void instance.intents.bump();
stress.flush = async (run: () => unknown) => {
	await run();
	await client.settled();
};
stress.ready = true;
