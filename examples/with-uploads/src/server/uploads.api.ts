import { api } from '@janux/server';
import { int, list as listOf, schema, str } from 'janux';
import { listUploads } from './store';

const upload = { id: str(), name: str(), type: str(), size: int() };

export const list = api({
  description:
    'List every stored upload (id, name, MIME type, size in bytes), newest first — ' +
    'the same listing the gallery island renders. Fetch the bytes from GET /api/uploads/:id.',
  output: schema({ uploads: listOf(upload) }),
  run: () => ({ uploads: listUploads() }),
});
