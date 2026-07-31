import { jsx } from 'janux';

/** Declares no policy on purpose: this is what the fail-safe default has to cover. */
export default function Account() {
  return jsx('main', { children: 'Your account' });
}
