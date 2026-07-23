import { jsx } from 'janux';

export default function Files({ params }: { params: { path: string } }) {
  return jsx('main', { children: `Files ${params.path}` });
}
