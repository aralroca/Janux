import { jsx } from 'janux';

export default function ServerErrorPage({ error }: { error: unknown }) {
  return jsx('main', { class: 'boom', children: `Broke: ${String(error)}` });
}
