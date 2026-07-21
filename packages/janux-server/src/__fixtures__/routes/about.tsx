import { jsx } from 'janux';

export const meta = {
  title: 'About — Janux fixture',
  description: 'Route-level metadata fixture.',
};

export default function About() {
  return jsx('main', { children: 'About page' });
}
