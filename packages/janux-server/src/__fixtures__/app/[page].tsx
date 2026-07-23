import { jsx } from 'janux';

export default function Page({ params }: { params: { page: string } }) {
  return jsx('main', { children: `Page ${params.page}` });
}
