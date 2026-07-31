---
title: Design system
description: "Janux ships no UI components and is not going to. This is where that decision is written down, and how foreign() gives you an ecosystem instead."
---

# Design system

**Janux ships no UI components, and is not going to.** There is no `<Button>`, no `@janux/ui`, no theme provider, no icon set. That is a decision rather than a gap, and this page is where it is written down so you do not have to infer it.

## Where do I get my buttons?

| What you need | Where it comes from |
|---|---|
| A button, an input, a card, a layout | **Plain JSX and your own CSS.** A Janux button is `<button>`, server-rendered, and ships 0 KB of JavaScript. |
| An accessible dialog, menu, combobox, tooltip | **[shadcn/ui](https://ui.shadcn.com) or [Radix](https://www.radix-ui.com)**, mounted through [`foreign()`](/docs/reference/foreign). |
| A data grid, charts, drag & drop, a graph editor | The React library you already use, through `foreign()` — the [interop matrix](/docs/more/interop-matrix) says which ones are verified in CI. |
| Tokens, utilities, theming | Any CSS you like: [Tailwind](/docs/styles/tailwind), [CSS variables](/docs/styles/css-variables), [Sass](/docs/styles/sass). |

The first row covers most of an application. The rest of this page is about the second.

## Why Janux does not compete here

Janux competes on **agent surface**, not on UI. The mounted component tree *is* the agent surface, and that is the thing nobody else ships. A11y primitives are a solved, crowded, and genuinely hard problem — a focus trap that works in every browser and screen reader is years of accumulated bug reports, not an afternoon — and a framework that ships its own is committing to maintain them forever.

The cheaper answer already works: `foreign()` mounts React components **unchanged**, so the entire React component ecosystem is available on day one without porting anything. That is not a promise here, it is a [published matrix](/docs/more/interop-matrix) of examples that build and pass end-to-end tests in CI — including [`interop-a11y-primitives`](https://github.com/aralroca/Janux/tree/main/examples/interop-a11y-primitives), which mounts a Radix dialog and keeps its focus trap, escape handling, `aria-modal` and scroll lock intact.

**What this stance commits us to** is `foreign()` itself: the boundary is the maintained surface, its limits are published, and a component that cannot mount is treated as a framework bug rather than a documentation footnote.

## Most of your UI needs no library at all

A Janux view is server-rendered HTML with real class names, so plain CSS goes further here than in a client-rendered framework. A component with no state compiles to markup and ships no `<script>` at all.

```tsx
import { component, intent, int, schema } from 'janux';

export const Counter = component({
  name: 'counter',
  description: 'A counter. The button is a button.',
  state: schema({ count: int().default(0) }),
  intents: {
    increment: intent({ description: 'Add one', run: ({ state }: any) => (state.count += 1) }),
  },
  view: ({ state, intents }: any) => (
    <button class="btn" onClick={intents.increment}>
      Clicked {state.count} times
    </button>
  ),
});
```

Reach for a React component library when you need behaviour that is genuinely hard — a focus trap, a virtualizer, typeahead matching — not when you need something that looks like a button.

## Using shadcn/ui in a Janux app

shadcn is not a dependency: it copies component source into your repo. That suits Janux well, because what lands is an ordinary React file you own and can add a pragma to.

```bash
bunx shadcn@latest add button
```

The CLI has no Janux template, so write `components.json` yourself before running it, and point its `aliases` at paths your app really resolves. It creates `src/components/ui/button.tsx` and installs that component's dependencies — but the `cn` helper the file imports is yours to create.

Then compose the pieces in **one** React file. `foreign()` does not forward `children`, so compositional APIs (`<Dialog.Root><Dialog.Trigger/></Dialog.Root>`) live inside a file of your own rather than being assembled from Janux:

```tsx
/** @jsxImportSource react */
import { Button } from './ui/button';

export interface SaveBarProps {
  dirty: boolean;
  onSave?: () => void;
  onDiscard?: () => void;
}

export function SaveBar({ dirty, onSave, onDiscard }: SaveBarProps) {
  return (
    <div className="save-bar">
      <Button variant="ghost" size="sm" disabled={!dirty} onClick={() => onDiscard?.()}>
        Discard
      </Button>
      <Button size="sm" disabled={!dirty} onClick={() => onSave?.()}>
        Save changes
      </Button>
    </div>
  );
}
```

Then wrap it **once** in an island that owns the state and exposes the intents. This is the step that matters: a foreign island renders a view only, so without the shell there is nothing for an agent to drive.

```tsx
import { bool, component, intent, schema, str } from 'janux';
import { foreign } from 'janux/interop';
import { SaveBar } from './SaveBar';

const Bar = foreign(SaveBar, {
  name: 'save-bar',
  props: (own: any) => ({ dirty: own.state.dirty }),
  on: {
    onSave: { intent: 'save', input: () => ({}) },
    onDiscard: { intent: 'discard', input: () => ({}) },
  },
});

export const SaveBarShell = component({
  name: 'draft',
  description: 'A draft with a save bar. The buttons are React; the decision is Janux.',
  state: schema({
    title: str().default('Untitled'),
    dirty: bool().default(true),
    saved: bool().default(false),
  }),
  intents: {
    save: intent({
      description: 'Save the draft',
      run: ({ state }: any) => {
        state.saved = true;
        state.dirty = false;
      },
    }),
    discard: intent({
      description: 'Discard changes',
      guard: 'confirm',
      run: ({ state }: any) => (state.dirty = false),
    }),
  },
  view: ({ state }: any) => (
    <section class="draft">
      <p class="draft-status">{state.saved ? 'saved' : state.dirty ? 'unsaved changes' : 'clean'}</p>
      <Bar state={state} />
    </section>
  ),
});
```

That app serves an unmodified shadcn `Button` in its server-rendered HTML, and its manifest advertises `draft.save` and `draft.discard` — the latter carrying `confirm`, so an agent has to ask before throwing work away. The foreign leaf itself appears nowhere in the manifest: **agent capability comes from the shell, never from the component library.**

## The one thing that will bite you

A Janux app sets `jsxImportSource: "janux"`, so a React file without the pragma compiles against the wrong JSX runtime. The build still succeeds, nothing is logged, and the island **server-renders as an empty host** — the failure mode looks identical to a broken `props` mapper.

```tsx
/** @jsxImportSource react */
```

Every React file in an interop island needs that first line, including the ones a CLI generated for you. If a foreign island renders blank, check the pragma before anything else.

## Why not ship our own primitives

The alternative was a headless, accessible primitive set of our own. It was rejected: it would cost a permanent maintenance commitment in a category where Janux has no advantage, to replace something that already works and is proven in CI. The honest version of "we have a design system" is that we do not, and you do not need one from us.

If `foreign()` ever fails to carry the ecosystem, that is the signal to reconsider — and it would show up first as red rows in the interop matrix, not as an opinion.

## Accessibility

Janux adds no a11y behaviour and takes none away. Roles, focus management and keyboard handling are yours in your own markup, and the library's when you mount one — the a11y example asserts exactly that: Radix's trap engages whether a human clicked the trigger or an agent called the intent.

## What it costs

React interop is opt-in and per island: an app with no foreign island ships none of it, and the 0 KB default is unaffected. An island that does mount React ships a second UI runtime, and the [measured weight of every example](/docs/more/interop-matrix) is published rather than implied — a Radix dialog app is 96 kB gzip against 24 kB for the same app without React.

Related: [Foreign-UI interop](/docs/guide/interop) · [`foreign()`](/docs/reference/foreign) · [Interop matrix](/docs/more/interop-matrix) · [Styling](/docs/styles/overview)
