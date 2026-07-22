export default {
  home: {
    title: 'Bienvenido a Janux i18n',
    lead: 'Esta página se renderiza en el servidor en "{{locale}}" — al cliente solo viajan las traducciones del contador.',
    about: 'Sobre esta demo →',
  },
  about: {
    title: 'Acerca de',
    body: 'Cada página vive bajo su prefijo de idioma. Los enlaces internos se prefijan automáticamente; los del selector llevan su propio idioma y no se tocan.',
    back: '← Volver al inicio',
  },
  counter: {
    label_0: 'Sin clics todavía',
    label_one: '{{count}} clic',
    label_other: '{{count}} clics',
    add: 'Haz clic',
    milestone: '¡Choca esos cinco! 🖐️',
  },
  switcher: { label: 'Idioma' },
};
