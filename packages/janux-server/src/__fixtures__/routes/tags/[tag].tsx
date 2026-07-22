import { jsx } from 'janux';

export default function Tag({ params }: { params: { tag: string } }) {
  return jsx('main', { children: `Tag ${params.tag}` });
}
