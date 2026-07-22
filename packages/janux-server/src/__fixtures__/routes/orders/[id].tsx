import { jsx } from 'janux';

export function staticParams() {
  return [{ id: '1' }, { id: '2' }];
}

export default function Order({ params }: { params: { id: string } }) {
  return jsx('main', { children: `Order ${params.id}` });
}
