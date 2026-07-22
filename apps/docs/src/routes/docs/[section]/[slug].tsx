import { Layout } from '../../../components/Layout';
import { DocsCopilot } from '../../../components/DocsCopilot';
import { docContent, docIndex, groupLabel, sectionLabel } from '../../../server/docs.api';
import { renderMarkdown, type TocEntry } from '../../../server/markdown';

export function staticParams() {
  return docIndex().map(({ section, slug }) => ({ section, slug }));
}

export function meta({ params }: { params: { section: string; slug: string } }) {
  const markdown = docContent(params.section, params.slug);
  const title = markdown?.match(/^# (.+)$/m)?.[1];

  return { title: title ? `${title} — Janux docs` : 'Janux docs' };
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

function NotFound({ slug }: { slug: string }) {
  return (
    <article>
      <h1>Not found</h1>
      <p>
        No doc named “{slug}”. <a href="/">Back home</a>.
      </p>
    </article>
  );
}

export default async function DocPage({ params }: { params: { section: string; slug: string } }) {
  const markdown = docContent(params.section, params.slug);
  const rendered = markdown ? await renderMarkdown(markdown) : undefined;
  const path = `/docs/${params.section}/${params.slug}`;

  return (
    <Layout current={path}>
      <div class="doc-grid">
        <main>
          <Breadcrumb section={params.section} slug={params.slug} />
          {rendered ? <article dangerHTML={rendered.html} /> : <NotFound slug={params.slug} />}
          {rendered ? <PrevNext path={path} /> : null}
        </main>
        {rendered ? <Toc toc={rendered.toc} /> : null}
      </div>
      <DocsCopilot persist />
    </Layout>
  );
}
