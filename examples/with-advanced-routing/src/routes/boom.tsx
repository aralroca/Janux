/** A page that fails on purpose, so `/boom` shows what `_500.tsx` is for. */
export default function Boom(): never {
  throw new Error('this page throws on purpose');
}
