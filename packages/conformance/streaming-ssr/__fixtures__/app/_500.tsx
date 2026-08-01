import { jsx } from 'janux';

/** Receives the error the render threw: the operator's copy goes to `onError`. */
export default function ServerErrorPage({ error }: { error: unknown }) {
  return jsx('main', { class: 'broke', children: `Broke: ${String(error)}` });
}
