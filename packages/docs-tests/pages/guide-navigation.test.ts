import { describe, expect, it } from 'bun:test';
import { component, defineConfig, jsx } from 'janux';
import { createJanuxServer } from '@janux/server';

/**
 * guide/navigation.md's navigation config, run against the real server: the
 * page tells people which knobs exist and what each one does to the document,
 * so each claim is checked by serving a page with that config.
 */

const shell = component({
  name: 'shell',
  view: () => jsx('nav', { children: jsx('a', { href: '/other', children: 'Other' }) }),
});

const serve = async (navigation?: Parameters<typeof defineConfig>[0]['navigation']) => {
  const server = createJanuxServer({
    routes: { '/': () => jsx(shell as any, {}) },
    runtimeUrl: '/client.js',
    navigation,
  });

  return (await server.fetch(new Request('http://test/'))).text();
};

const rulesIn = (html: string) => JSON.parse(html.match(/type="speculationrules"[^>]*>([^<]+)</)![1]!);

describe('guide/navigation.md', () => {
  it('emits hover-eagerness speculation rules for internal links by default', async () => {
    const rules = rulesIn(await serve());

    expect(rules.prefetch[0]).toEqual({ where: { href_matches: '/*' }, eagerness: 'moderate' });
  });

  // The config block the page shows, verbatim in shape.
  it('applies the documented eagerness and exclude options', async () => {
    const config = defineConfig({
      navigation: {
        spa: true,
        prefetch: { ttl: 60_000 },
        speculationRules: { eagerness: 'moderate', exclude: ['/logout', '/checkout/*'] },
      },
    });
    const html = await serve(config.navigation);
    const rules = rulesIn(html);

    expect(rules.prefetch[0].where.and).toEqual([
      { href_matches: '/*' },
      { not: { href_matches: '/logout' } },
      { not: { href_matches: '/checkout/*' } },
    ]);
    // And the client gets the prefetch TTL it must honour.
    expect(html).toContain('"ttl":60000');
  });

  it('speculationRules: false leaves the document without the script', async () => {
    expect(await serve({ speculationRules: false })).not.toContain('speculationrules');
  });
});
