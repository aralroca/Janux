export default {
  home: {
    title: 'Welcome to Janux i18n',
    lead: 'This page is server-rendered in "{{locale}}" — only the counter translations below ship to the client.',
    about: 'About this demo →',
  },
  about: {
    title: 'About',
    body: 'Every page lives under its locale prefix. Internal links are prefixed automatically; the switcher links carry their own locale and stay untouched.',
    back: '← Back home',
  },
  counter: {
    label_0: 'No clicks yet',
    label_one: '{{count}} click',
    label_other: '{{count}} clicks',
    add: 'Click me',
    milestone: 'High five! 🖐️',
  },
  switcher: { label: 'Language' },
};
