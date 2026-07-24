import { jsx } from 'janux';

export default function UserById({ params }: { params: { id: string } }) {
  return jsx('main', { children: `User#${params.id}` });
}
