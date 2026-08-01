import { jsx } from 'janux';

export const meta = { title: 'Nothing here' };

export default function NotFoundPage() {
  return jsx('main', { class: 'missing', children: 'No such page' });
}
