import { jsx } from 'janux';

export default function ProductsLayout({ children }: { children: unknown }) {
  return jsx('div', { 'data-shell': 'products', children });
}
