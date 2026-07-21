import { marked } from 'marked';
import { Layout } from '../../components/Layout';
import { DocsCopilot } from '../../components/DocsCopilot';
import { docContent } from '../../server/docs.api';

export default function DocPage({ params }: { params: { slug: string } }) {
  const markdown = docContent(params.slug);

  return (
    <Layout current={params.slug}>
      <main>
        {markdown ? (
          <article dangerHTML={marked.parse(markdown, { async: false }) as string} />
        ) : (
          <article>
            <h1>Not found</h1>
            <p>
              No doc named “{params.slug}”. <a href="/">Back home</a>.
            </p>
          </article>
        )}
      </main>
      <DocsCopilot />
    </Layout>
  );
}
