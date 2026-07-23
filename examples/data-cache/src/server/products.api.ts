import { api } from '@janux/server';
import { schema, str } from 'janux';

const PRODUCTS = [
  { id: 'p1', name: 'Keyboard', tag: 'input' },
  { id: 'p2', name: 'Mouse', tag: 'input' },
  { id: 'p3', name: 'Monitor', tag: 'display' },
  { id: 'p4', name: 'Webcam', tag: 'video' },
];

export const listProducts = api({
  description: 'List products, optionally filtered by tag.',
  input: schema({ tag: str().default('all') }),
  run: ({ input }) => (input.tag === 'all' ? PRODUCTS : PRODUCTS.filter((p) => p.tag === input.tag)),
});
