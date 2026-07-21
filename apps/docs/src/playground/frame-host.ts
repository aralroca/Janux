const SRCDOC = `<!doctype html>
<html>
<head>
<script type="importmap">{"imports":{
  "janux":"/src/playground/pg-runtime.ts",
  "janux/jsx-runtime":"/src/playground/pg-runtime.ts",
  "janux/jsx-dev-runtime":"/src/playground/pg-runtime.ts",
  "janux/client":"/src/playground/pg-runtime.ts"
}}</scr` + `ipt>
<style>body{margin:0;background:#fff;color:#0f172a}</style>
</head>
<body>
<div id="root"></div>
<script type="module" src="/src/playground/pg-frame.ts"></scr` + `ipt>
</body>
</html>`;

export interface FrameHost {
  iframe: HTMLIFrameElement;
  send(message: Record<string, unknown>): void;
}

/** Sandboxed execution iframe: user code runs isolated; parent talks over postMessage. */
export function createFrame(
  container: HTMLElement,
  onMessage: (data: any) => void,
): FrameHost {
  const iframe = document.createElement('iframe');

  // allow-same-origin is required for the module import map to load from the
  // dev server (opaque origins are CORS-blocked). The sandbox here isolates
  // crashes, not the user from their own code — same trade-off as any REPL.
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
  iframe.srcdoc = SRCDOC;
  container.appendChild(iframe);
  window.addEventListener('message', (event) => {
    if (event.source === iframe.contentWindow) onMessage(event.data);
  });

  return { iframe, send: (message) => iframe.contentWindow?.postMessage(message, '*') };
}

export function encodeShare(code: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(code)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function decodeShare(hash: string): string | undefined {
  const match = /#c=([A-Za-z0-9_-]+)/.exec(hash);

  if (!match) return undefined;
  try {
    const base64 = match[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));

    return new TextDecoder().decode(bytes);
  } catch {
    return undefined;
  }
}
