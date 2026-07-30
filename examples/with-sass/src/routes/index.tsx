import { Palette } from '../components/Palette';

export const meta = {
  title: 'Janux — styling with Sass',
  description: 'Variables, nesting, mixins and an @each loop, compiled to a single /styles.css.',
};

export default function Home() {
  return (
    <main>
      <h1>Sass</h1>
      <p class="lede">
        Name the entry <code>src/styles.scss</code> and it is compiled — no <code>vite.config</code>, no PostCSS
        wiring. Variables, nesting, mixins and loops all resolve at build time; the browser only ever sees the
        CSS they produced.
      </p>
      <Palette />
    </main>
  );
}
