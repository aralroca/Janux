import { api } from '@janux/server';
import { schema, str } from 'janux';

export const greet = api({
  description: 'Greet someone by name',
  input: schema({ name: str() }),
  run: ({ input }) => ({ message: `Hello, ${input.name}! — from a Janux api() tool` }),
});
