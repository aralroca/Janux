// @file: src/content/config.ts
import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    draft: z.boolean().default(false),
    order: z.number(),
    tags: z.array(z.string()),
    status: z.enum(['draft', 'published']),
    author: z.object({ name: z.string() }),
  }),
});

export const collections = { blog };
