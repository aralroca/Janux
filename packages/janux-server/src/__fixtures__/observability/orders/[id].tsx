import { jsx } from 'janux';

export default function Order({ params }: { params: Record<string, string> }) {
  return jsx('main', { children: `Order ${params.id}` });
}
