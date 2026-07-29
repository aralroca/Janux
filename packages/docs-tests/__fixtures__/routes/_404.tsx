import { jsx } from 'janux';

/** guide/navigation.md § Not found & server errors, as a file. */
export const meta = { title: 'Page not found', robots: 'noindex' };

export default function NotFound() {
  return jsx('main', { children: 'This page does not exist' });
}
