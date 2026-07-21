/**
 * The single module the playground iframe's import map points every
 * `janux*` specifier at: core + jsx runtime + the client pieces needed
 * to mount user code live.
 */
export * from 'janux';
export { jsxDEV } from 'janux/jsx-dev-runtime';
export { toDomNodes, morph } from 'janux/client';
