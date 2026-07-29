import { jsx } from 'janux';

export default function ServerError({ error }: { error: unknown }) {
  return jsx('main', { children: `Something went wrong: ${String(error)}` });
}
