import type { HandlerContext } from '../../../http-handlers';

export function GET({ params }: HandlerContext) {
  return Response.json({ id: params.id });
}
