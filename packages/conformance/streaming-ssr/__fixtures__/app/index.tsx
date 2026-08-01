import { jsx } from 'janux';

export const meta = { title: 'Streaming home', description: 'A static page' };

export default function Home() {
  return jsx('main', { children: [jsx('h1', { children: 'home' }), jsx('p', { children: 'static' })] });
}
