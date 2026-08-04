// @file: src/content/config.ts
import { defineCollection } from '@janux/content';
import { bool, enums, list, num, obj, schema, str } from 'janux';

const blog = defineCollection({
  schema: schema({
    title: str(),
    description: str().optional(),
    draft: bool().default(false),
    order: num(),
    tags: list(str()),
    status: enums(['draft', 'published']),
    author: obj({ name: str() }),
  }),
});

export const collections = { blog };
