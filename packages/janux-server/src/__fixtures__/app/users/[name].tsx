import { jsx } from 'janux';

export default function UserByName({ params }: { params: { name: string } }) {
  return jsx('main', { children: `User:${params.name}` });
}
