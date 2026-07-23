import { jsx } from 'janux';

export default function TeamLayout({ children, params }: { children: unknown; params: { team: string } }) {
  return jsx('div', { class: 'team-shell', 'data-team': params.team, children });
}
