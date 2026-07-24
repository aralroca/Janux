import { jsx } from 'janux';

export default function MarketingLayout({ children }: { children: unknown }) {
  return jsx('section', { class: 'marketing', children });
}
