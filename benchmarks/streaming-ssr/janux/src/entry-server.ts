import { jsx } from 'janux/jsx-runtime';
import { renderToStream } from 'janux/server';
import { App } from './App';
import { makeCards, type Scenario } from './data';

// Streaming SSR entry — Janux target. `renderToStream` streams the shell with
// each suspense island's skeleton, then a `<template>` + inline-swap chunk per
// boundary as its source resolves (out-of-order). The card promises start at
// t0 via `makeCards`, exactly like the sibling fixtures, and reach the islands
// through `ctx`.
export const streaming = true;

export async function renderStream(scenario: Scenario, onChunk: (chunk: string) => void): Promise<void> {
	const { chunks, done } = renderToStream(jsx(App, {}), { ctx: { cards: makeCards(scenario) } });

	for await (const chunk of chunks) onChunk(chunk);
	await done;
}
