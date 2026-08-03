import { api } from '@janux/server';
import { list, schema, str } from 'janux';

export const catalog = api({
  description: 'Lists the items the harness fixture renders',
  output: schema({ items: list(str()) }),
  run: () => ({ items: ['real-a', 'real-b'] }),
});
