import { jsx } from 'janux';
import { lateBoom } from './_islands';

/** The `<h1>` streams; the sibling then throws, after the status line is spent. */
export default function LateBoom() {
  return jsx('main', { children: [jsx('h1', { children: 'flushed' }), jsx(lateBoom as any, {})] });
}
