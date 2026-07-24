import { jsx } from 'janux';

export default function Team({ params }: { params: { team: string } }) {
  return jsx('main', { children: `Team ${params.team}` });
}
