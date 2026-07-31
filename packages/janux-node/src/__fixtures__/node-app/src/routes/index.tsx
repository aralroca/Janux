import { jsx } from 'janux';
import { Counter } from '../components/Counter';
import { Items } from '../components/Items';

export default function Home() {
  return jsx('main', { children: ['Served by Node', jsx(Counter, {}), jsx(Items, {})] });
}
