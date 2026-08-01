import { createJanuxServer } from '@janux/server';
import { describe, expect } from 'bun:test';
import { jsx } from 'janux';
import { runCases } from '../support/scenario';
import { LOCALE_SERVER_CASES } from './locale-server.cases';

const server = createJanuxServer({
  title: 'conformance',
  siteUrl: 'https://conformance.test',
  llmsTxt: { description: 'router-nav locale conformance' },
  i18n: { locales: ['en', 'es', 'ar'], defaultLocale: 'en', messages: { en: {}, es: {}, ar: {} } },
  routes: {
    '/': () => jsx('main', { children: 'home' }),
    '/about': () => jsx('p', { children: 'about' }),
  },
  runtimeUrl: '/client.js',
});

describe('locale routing over http', () =>
  runCases(LOCALE_SERVER_CASES, async (row) => {
    const headers = new Headers();

    if (row.cookie) headers.set('cookie', row.cookie);
    if (row.accept) headers.set('accept-language', row.accept);
    const response = await server.fetch(
      new Request(`http://conformance.test${row.path}`, { method: row.method ?? 'GET', headers }),
    );

    expect(response.status).toBe(row.status);
    expect(response.headers.get('location')).toBe(row.location);
    if (row.html) expect(await response.text()).toContain(row.html);
  }));
