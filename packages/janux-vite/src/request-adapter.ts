import type { IncomingMessage, ServerResponse } from 'node:http';

async function readBody(req: IncomingMessage): Promise<Buffer | undefined> {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  const chunks: Buffer[] = [];

  for await (const chunk of req) chunks.push(chunk as Buffer);

  return Buffer.concat(chunks);
}

export async function toFetchRequest(req: IncomingMessage): Promise<Request> {
  const host = req.headers.host ?? 'localhost';
  const body = await readBody(req);

  return new Request(`http://${host}${req.url ?? '/'}`, {
    method: req.method,
    headers: Object.entries(req.headers).map(([name, value]) => [name, String(value)] as [string, string]),
    body: body && body.length > 0 ? new Uint8Array(body) : undefined,
  });
}

export async function sendFetchResponse(res: ServerResponse, response: Response): Promise<void> {
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  if (!response.body) {
    res.end();

    return;
  }
  // Piped chunk by chunk, not buffered: pages are streamed SSR now, and
  // collecting the body first would hold every chunk until the slowest
  // island resolved — exactly what streaming exists to avoid.
  for await (const chunk of response.body) res.write(chunk);
  res.end();
}
