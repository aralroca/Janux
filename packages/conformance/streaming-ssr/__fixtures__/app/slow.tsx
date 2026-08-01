import { jsx } from 'janux';
import { slowList } from './_islands';

export const meta = { title: 'Streaming slow' };

export default function Slow() {
  return jsx('main', { children: [jsx('h1', { children: 'shell' }), jsx(slowList as any, {})] });
}
