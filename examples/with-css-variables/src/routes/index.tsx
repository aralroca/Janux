import { ThemeLab } from '../components/ThemeLab';

export const meta = {
  title: 'Janux — theming with CSS custom properties',
  description: 'Island state writes CSS variables; the cascade rethemes everything below, with no rebuild.',
};

export default function Home() {
  return (
    <main>
      <h1>CSS variables</h1>
      <p class="lede">
        Sass resolves at build time and Tailwind ships utilities. Custom properties are the third option: the
        values change <em>at runtime</em>, so state can retheme a page without shipping one extra rule.
      </p>
      <ThemeLab />
    </main>
  );
}
