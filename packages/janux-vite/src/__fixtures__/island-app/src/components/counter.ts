import { component, jsx } from 'janux';

export const Counter = component({
  name: 'counter',
  view: () => jsx('button', { children: 'hi' }),
});
