import { describe, expect, it } from 'bun:test';
import { isNotFoundError, notFound } from 'janux';
import { createJanuxServer } from '@janux/server';

/**
 * reference/core-api.md documents `notFound()` as a call that never returns and
 * that the server turns into the app's `_404` page — both halves run here.
 */

describe('reference/core-api.md — notFound() / isNotFoundError()', () => {
  it('never returns, and the signal is recognizable', () => {
    const after = () => {
      notFound();

      return 'unreachable';
    };

    expect(after).toThrow();
    expect(() => {
      try {
        notFound();
      } catch (error) {
        expect(isNotFoundError(error)).toBe(true);
        throw error;
      }
    }).toThrow();
  });

  it('an ordinary failure is not a notFound signal', () => {
    expect(isNotFoundError(new Error('boom'))).toBe(false);
  });

  it('the server answers the page that called it with a 404', async () => {
    const app = createJanuxServer({ routesDir: `${import.meta.dir}/../__fixtures__/routes` });
    const response = await app.fetch(new Request('http://test/posts/nope'));

    expect(response.status).toBe(404);
    expect(await response.text()).toContain('This page does not exist');
  });
});
