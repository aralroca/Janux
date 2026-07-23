import { jsx } from 'janux';

export default function Docs({ params }: { params: { slug: string } }) {
  return jsx('main', { children: `Docs ${params.slug}` });
}
