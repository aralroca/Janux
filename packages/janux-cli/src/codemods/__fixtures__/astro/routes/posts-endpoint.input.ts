// @file: src/pages/api/posts.ts
import { allPosts } from '../../data/posts';

export async function GET() {
  return Response.json(await allPosts());
}
