import { boot } from 'janux/client';
import { Header } from './App';

// Janux "hydration" is a resume: `boot()` indexes the SSR islands + state
// snapshots and installs the delegated listeners — synchronously, touching no
// DOM and running no component code. The island itself mounts lazily on the
// first delegated event (the harness's #theme click), which is the framework's
// actual interactivity model, so that is what `__hydrate()` measures.
(window as any).__hydrate = () => {
	boot({ defs: [Header], navigation: false, webmcp: false });
};
(window as any).__ready = true;
