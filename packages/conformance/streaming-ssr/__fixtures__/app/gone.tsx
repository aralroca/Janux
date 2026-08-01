import { notFound } from 'janux';

/** A matched route with nothing to show — a 404 the router could not have known. */
export default function Gone(): never {
  return notFound();
}
