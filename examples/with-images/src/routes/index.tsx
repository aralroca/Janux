import { Image, type PageMeta } from 'janux';

export const meta: PageMeta = {
  title: 'Images — Janux',
  description: 'Responsive AVIF/WebP images with the box reserved before the bytes arrive, and zero JavaScript.',
  canonical: '/',
};

const GALLERY = [
  { src: '/photos/dunes.jpg', alt: 'Banded violet and green gradient, like layered dunes', caption: 'dunes.jpg' },
  { src: '/photos/reef.jpg', alt: 'Turquoise and magenta gradient, like a reef from above', caption: 'reef.jpg' },
  { src: '/photos/forest.jpg', alt: 'Soft green gradient bands, like a canopy from above', caption: 'forest.jpg' },
];

/**
 * The LCP image: `priority` so it is fetched eagerly at high priority, and
 * `sizes` because it is fluid — it spans the column, not 1200 fixed pixels.
 */
function Hero() {
  return (
    <figure class="hero">
      <Image
        src="/photos/aurora.jpg"
        alt="Green and violet colour field, like an aurora"
        width={1200}
        aspectRatio="16/9"
        priority
        sizes="(max-width: 70rem) 100vw, 70rem"
      />
      <figcaption>
        <code>priority</code> · fluid <code>sizes</code> · <code>aspectRatio="16/9"</code>
      </figcaption>
    </figure>
  );
}

/** Below the fold, so every one of these is lazy — the default. */
function Gallery() {
  return (
    <section class="gallery" aria-labelledby="gallery-title">
      <h2 id="gallery-title">Lazy by default</h2>
      <ul>
        {GALLERY.map((photo) => (
          <li key={photo.src}>
            <Image src={photo.src} alt={photo.alt} width={400} height={300} />
            <p>{photo.caption}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The two sources the optimizer deliberately leaves alone. An SVG is already
 * vector, and a remote URL is not a file this build can open — which is why it
 * has to say `unoptimized` out loud instead of failing quietly.
 */
function PassThrough() {
  return (
    <section class="pass-through" aria-labelledby="pass-title">
      <h2 id="pass-title">Sources it does not touch</h2>
      <ul>
        <li>
          <Image src="/logo.svg" alt="Janux mark" width={72} height={72} />
          <p>
            <code>/logo.svg</code> — vector already, so it is linked as-is
          </p>
        </li>
        <li>
          <Image src="https://janux.build/favicon.svg" alt="janux.build mark" width={72} height={72} unoptimized />
          <p>
            <code>unoptimized</code> — remote, and explicit about it
          </p>
        </li>
      </ul>
    </section>
  );
}

export default function HomePage() {
  return (
    <>
      <header class="page-head">
        <h1>Images that come with the framework</h1>
        <p class="lede">
          One <code>&lt;Image&gt;</code>. AVIF and WebP variants written by <code>janux build</code>, a{' '}
          <code>srcset</code> derived from the layout width, and <code>width</code>/<code>height</code> on every tag so
          nothing on this page moves while it loads. No client runtime — view source.
        </p>
      </header>
      <Hero />
      <Gallery />
      <PassThrough />
    </>
  );
}
