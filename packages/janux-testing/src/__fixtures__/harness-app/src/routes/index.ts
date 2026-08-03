import { jsx } from 'janux';

export default function Home({ ctx }: { ctx?: { user?: string } }) {
  return jsx('main', { children: [jsx('h1', { children: 'home page' }), jsx('p', { children: `user:${ctx?.user ?? 'anon'}` })] });
}
