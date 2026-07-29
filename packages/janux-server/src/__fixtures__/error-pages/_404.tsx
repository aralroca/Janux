import { jsx } from 'janux';

export const meta = { title: 'Nothing here' };

export default function NotFoundPage() {
  return jsx('main', { class: 'not-found', children: 'No such page' });
}
