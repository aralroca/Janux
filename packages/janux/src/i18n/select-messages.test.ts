import { describe, expect, it } from 'bun:test';
import { selectMessages } from './select-messages';

const messages = {
  title: 'Welcome',
  nav: { about: 'About', home: 'Home' },
  cart_one: 'One item',
  cart_other: '{{count}} items',
  toast: { saved: 'Saved', deleted: 'Deleted' },
  unused: 'Never shipped',
};

describe('selectMessages', () => {
  it('keeps exact keys and their plural variants', () => {
    expect(selectMessages(messages, ['title', 'cart'])).toEqual({
      title: 'Welcome',
      cart_one: 'One item',
      cart_other: '{{count}} items',
    });
  });

  it('keeps nested subtrees for recorded parent keys', () => {
    expect(selectMessages(messages, ['nav'])).toEqual({ nav: { about: 'About', home: 'Home' } });
    expect(selectMessages(messages, ['nav.about'])).toEqual({ nav: { about: 'About' } });
  });

  it('includes declared i18nKeys as string prefixes or RegExp', () => {
    expect(selectMessages(messages, [], ['toast.saved'])).toEqual({ toast: { saved: 'Saved' } });
    expect(selectMessages(messages, [], ['toast'])).toEqual({ toast: { saved: 'Saved', deleted: 'Deleted' } });
    expect(selectMessages(messages, [], [/^toast\.del/])).toEqual({ toast: { deleted: 'Deleted' } });
  });

  it('returns an empty dictionary when nothing matches', () => {
    expect(selectMessages(messages, ['nope'], [])).toEqual({});
  });

  it('respects a custom key separator', () => {
    expect(selectMessages({ a: { b: 'deep' } }, ['a:b'], [], ':')).toEqual({ a: { b: 'deep' } });
  });
});
