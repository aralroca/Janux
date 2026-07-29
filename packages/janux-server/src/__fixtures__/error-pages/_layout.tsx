import { jsx } from 'janux';

export default function RootLayout({ children }: { children: unknown }) {
  return jsx('div', { class: 'site-shell', children });
}
