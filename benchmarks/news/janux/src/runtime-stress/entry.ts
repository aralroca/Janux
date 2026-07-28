import { boot } from 'janux/client';
import { installRuntimeStress } from '../../../../runtime-stress/shared.js';
import { AsyncPanel, FormPanel, LifecyclePanel, StorePanel } from './App';

const stress = installRuntimeStress();
const client = boot({
	defs: [LifecyclePanel, FormPanel, StorePanel, AsyncPanel],
	navigation: false,
	webmcp: false,
});

await Promise.all(
	['stress-lifecycle#1', 'stress-form#1', 'stress-store#1', 'stress-async#1'].map((id) =>
		client.mount(id),
	),
);
await client.settled();
stress.ready = true;
