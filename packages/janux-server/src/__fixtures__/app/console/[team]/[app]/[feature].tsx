import { jsx } from 'janux';

export default function Feature({ params }: { params: Record<string, string> }) {
  return jsx('main', { children: `Feature ${params.team}/${params.app}/${params.feature}` });
}
