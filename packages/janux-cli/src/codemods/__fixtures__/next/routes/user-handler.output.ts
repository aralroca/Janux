// @file: src/api/users/[id].ts
import { findUser } from '../../../lib/users';

export async function GET({ params }: { params: { id: string } }) {
  const user = await findUser(params.id);

  return Response.json(user);
}
