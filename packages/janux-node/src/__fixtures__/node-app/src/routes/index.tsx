import { jsx } from 'janux';
import { Counter } from '../components/Counter';

export default function Home() {
  return jsx('main', { children: ['Served by Node', jsx(Counter, {})] });
}
