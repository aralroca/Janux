import { articleJsonLd, breadcrumbJsonLd, notFound, type PageMeta } from 'janux';
import { Layout } from '../../../components/Layout';
import { docEntry, docIndex, groupLabel, sectionLabel } from '../../../server/docs.api';
import { renderMarkdown, type TocEntry } from '../../../server/markdown';
import { absolute, SOCIAL_IMAGE } from '../../../site';

export function staticParams() {
  return docIndex().map(({ section, slug }) => ({ section, slug }));
}

interface DocMeta {
  title: string;
  path: string;
  section: string;
  slug: string;
  description?: string;
}

/**
 * The breadcrumb trail mirrors the visible one, but only where it is navigable:
 * sections and groups are sidebar labels with no page of their own, so they ride
 * on `articleSection` rather than becoming URL-less crumbs a validator rejects.
 */
function docJsonLd({ title, path, section, slug, description }: DocMeta) {
  const trail = [sectionLabel(section), groupLabel(section, slug)].filter(Boolean).join(' / ');

  return [
    breadcrumbJsonLd([
      { name: 'Docs', url: absolute('/') },
      { name: title, url: absolute(path) },
    ]),
    {
      ...articleJsonLd({ type: 'TechArticle', headline: title, description, section: trail, url: absolute(path) }),
      isPartOf: { '@type': 'WebSite', name: 'Janux', url: absolute('/') },
    },
  ];
}

export function meta({ params }: { params: { section: string; slug: string } }): PageMeta {
  const doc = docEntry(params.section, params.slug);

  // No such doc: the page calls notFound(), and `_404.tsx` brings its own meta.
  if (!doc) return {};
  // Authored, not guessed: the collection schema is what guarantees both exist.
  const { title, description } = doc.data;
  const path = `/docs/${params.section}/${params.slug}`;

  return {
    title: `${title} — Janux docs`,
    description,
    canonical: path,
    image: SOCIAL_IMAGE,
    og: { type: 'article' },
    jsonLd: docJsonLd({ title, path, section: params.section, slug: params.slug, description }),
  };
}

function Breadcrumb({ section, slug }: { section: string; slug: string }) {
  const group = groupLabel(section, slug);

  return (
    <p class="breadcrumb">
      <a href="/">Docs</a> <span>/</span> {sectionLabel(section)}
      {group ? (
        <>
          {' '}
          <span>/</span> {group}
        </>
      ) : null}
    </p>
  );
}

function Toc({ toc }: { toc: TocEntry[] }) {
  if (toc.length < 2) return null;

  return (
    <aside class="toc">
      <p class="toc-title">On this page</p>
      <ul>
        {toc.map((entry) => (
          <li key={entry.id} class={`depth-${entry.depth}`}>
            <a href={`#${entry.id}`}>{entry.text}</a>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function PrevNext({ path }: { path: string }) {
  const index = docIndex();
  const position = index.findIndex((doc) => doc.path === path);
  const prev = index[position - 1];
  const next = index[position + 1];

  return (
    <nav class="prev-next">
      {prev ? (
        <a class="prev" href={prev.path}>
          ← {prev.title}
        </a>
      ) : (
        <span />
      )}
      {next ? (
        <a class="next" href={next.path}>
          {next.title} →
        </a>
      ) : (
        <span />
      )}
    </nav>
  );
}

export default async function DocPage({ params }: { params: { section: string; slug: string } }) {
  const doc = docEntry(params.section, params.slug);

  // A URL that names no doc is a 404, not a doc page about the absence of one:
  // `_404.tsx` answers it, with the status crawlers and readers both expect.
  if (!doc) notFound();
  const rendered = await renderMarkdown(doc.body);
  const path = `/docs/${params.section}/${params.slug}`;

  return (
    <Layout current={path}>
      <div class="doc-grid">
        <main>
          <Breadcrumb section={params.section} slug={params.slug} />
          <article dangerHTML={rendered.html} />
          <PrevNext path={path} />
        </main>
        <Toc toc={rendered.toc} />
      </div>
    </Layout>
  );
}
