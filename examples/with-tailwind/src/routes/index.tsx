import { PricingTable } from '../components/Pricing';

export const meta = {
  title: 'Janux — Tailwind v4 pricing',
  description: 'A pricing page styled entirely with Tailwind utilities, zero config.',
};

export default function Home() {
  return (
    <div class="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased dark:bg-slate-950 dark:text-white">
      <header class="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <span class="text-lg font-bold">⚡ Janux + Tailwind</span>
        <span class="rounded-full bg-blue-600/10 px-3 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400">
          zero config
        </span>
      </header>
      <main class="mx-auto flex max-w-5xl flex-col items-center gap-4 px-6 pb-24 pt-12">
        <h1 class="bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-center text-5xl font-extrabold tracking-tight text-transparent">
          Simple pricing
        </h1>
        <p class="max-w-xl text-center text-slate-500 dark:text-slate-400">
          Every style on this page is a Tailwind utility. The whole setup is one dependency and one
          CSS import — dark mode included, straight from your OS preference.
        </p>
        <PricingTable />
      </main>
    </div>
  );
}
