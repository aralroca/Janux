import { jsx } from 'janux';
import { stuck } from './_islands';

export default function Stuck() {
  return jsx('main', { children: [jsx('h1', { children: 'shell' }), jsx(stuck as any, {})] });
}
