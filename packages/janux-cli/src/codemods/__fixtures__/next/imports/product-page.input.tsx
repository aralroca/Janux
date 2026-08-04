// @file: src/routes/products/[id]/index.tsx
import Image from 'next/image';
import Link from 'next/link';
import { notFound, useRouter } from 'next/navigation';
import { findProduct } from '../../../lib/products';

export default function Product({ params }: { params: { id: string } }) {
  const product = findProduct(params.id);

  if (!product) notFound();

  return (
    <article>
      <Image src={product.image} width={480} height={480} alt={product.name} />
      <h1>{product.name}</h1>
      <Link href="/products">Back to the catalog</Link>
    </article>
  );
}
