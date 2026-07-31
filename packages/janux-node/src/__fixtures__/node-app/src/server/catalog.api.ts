import { api, revalidateTag } from '@janux/server';

export const listItems = api({
  description: 'The items the query island reads.',
  run: () => [{ id: 'n1' }, { id: 'n2' }],
});

export const revalidateCatalog = api({
  description: 'Drop every cached response tagged "catalog".',
  run: () => {
    revalidateTag('catalog');

    return { revalidated: 'catalog' };
  },
});
