/** Fails before a single byte could be flushed: the status line is still ours. */
export default function Boom(): never {
  throw new Error('page exploded');
}
