import { cachePolicy, jsx } from 'janux';

export const cache = cachePolicy({
  name: 'product-page',
  scope: 'public',
  sharedMaxAge: '5m',
  tags: ['catalog', 'product:[id]'],
});

export default function Product({ params }: { params: { id: string } }) {
  return jsx('main', { children: `Product ${params.id}` });
}
