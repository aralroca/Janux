import type * as CSS from 'csstype';

/**
 * The shape of a `style={{…}}` object: every CSS property (camelCased, from
 * csstype) plus `--*` custom properties, which keep their casing.
 *
 * Unlike React, a bare number is never given a unit: `{ width: 10 }` renders
 * `width:10`, not `width:10px`. The guess is wrong for `lineHeight`, `flex`,
 * `zIndex`, `opacity` and every unitless property, so Janux asks for the unit
 * instead of maintaining a list of exceptions.
 *
 * Example:
 *
 * ```tsx
 * <div style={{ backgroundColor: 'red', width: '10px', '--accent': '#06f' }} />
 * ```
 */
export interface CSSProperties extends CSS.Properties<string | number> {
  [key: `--${string}`]: string | number | undefined;
}

/**
 * WAI-ARIA states and properties, valid on every element.
 * https://developer.mozilla.org/docs/Web/Accessibility/ARIA/Attributes
 */
export interface AriaAttributes {
  /** Identifies the currently active descendant of a composite widget. */
  'aria-activedescendant'?: string | undefined;
  /** Whether assistive tech presents the whole changed region, not just the delta. */
  'aria-atomic'?: boolean | 'true' | 'false' | undefined;
  /** How input completion suggestions are presented. */
  'aria-autocomplete'?: 'none' | 'inline' | 'list' | 'both' | undefined;
  /** Braille label for the element. */
  'aria-braillelabel'?: string | undefined;
  /** Braille role description for the element. */
  'aria-brailleroledescription'?: string | undefined;
  /** The element is being modified; assistive tech may wait to announce it. */
  'aria-busy'?: boolean | 'true' | 'false' | undefined;
  /** Checked state of checkboxes, radios and other widgets. */
  'aria-checked'?: boolean | 'true' | 'false' | 'mixed' | undefined;
  /** Total number of columns in a table-like structure. */
  'aria-colcount'?: number | undefined;
  /** Column index of the element within a table-like structure. */
  'aria-colindex'?: number | undefined;
  /** Human-readable text alternative of `aria-colindex`. */
  'aria-colindextext'?: string | undefined;
  /** Number of columns spanned by a cell. */
  'aria-colspan'?: number | undefined;
  /** id list of the elements whose contents or presence this element controls. */
  'aria-controls'?: string | undefined;
  /** Marks the element that represents the current item within a set. */
  'aria-current'?: boolean | 'true' | 'false' | 'page' | 'step' | 'location' | 'date' | 'time' | undefined;
  /** id list of the elements that describe this one. */
  'aria-describedby'?: string | undefined;
  /** Plain-text description of the element. */
  'aria-description'?: string | undefined;
  /** id of the element providing an extended description. */
  'aria-details'?: string | undefined;
  /** The element is perceivable but disabled. */
  'aria-disabled'?: boolean | 'true' | 'false' | undefined;
  /** id of the element carrying the current error message. */
  'aria-errormessage'?: string | undefined;
  /** Whether the controlled grouping element is expanded. */
  'aria-expanded'?: boolean | 'true' | 'false' | undefined;
  /** id list defining an alternate reading order. */
  'aria-flowto'?: string | undefined;
  /** Kind of popup triggered by the element. */
  'aria-haspopup'?: boolean | 'true' | 'false' | 'menu' | 'listbox' | 'tree' | 'grid' | 'dialog' | undefined;
  /** The element is not exposed to the accessibility tree. */
  'aria-hidden'?: boolean | 'true' | 'false' | undefined;
  /** The entered value does not conform to the expected format. */
  'aria-invalid'?: boolean | 'true' | 'false' | 'grammar' | 'spelling' | undefined;
  /** Keyboard shortcuts that activate the element. */
  'aria-keyshortcuts'?: string | undefined;
  /** String label for the element. */
  'aria-label'?: string | undefined;
  /** id list of the elements that label this one. */
  'aria-labelledby'?: string | undefined;
  /** Hierarchical level of the element (headings, tree items…). */
  'aria-level'?: number | undefined;
  /** Politeness level for live-region updates. */
  'aria-live'?: 'off' | 'assertive' | 'polite' | undefined;
  /** The element is modal when displayed. */
  'aria-modal'?: boolean | 'true' | 'false' | undefined;
  /** The text box accepts multiple lines of input. */
  'aria-multiline'?: boolean | 'true' | 'false' | undefined;
  /** More than one item may be selected. */
  'aria-multiselectable'?: boolean | 'true' | 'false' | undefined;
  /** Orientation of the element. */
  'aria-orientation'?: 'horizontal' | 'vertical' | undefined;
  /** id list of children not expressible in the DOM hierarchy. */
  'aria-owns'?: string | undefined;
  /** Short hint intended to aid data entry. */
  'aria-placeholder'?: string | undefined;
  /** Position of the item within the current set. */
  'aria-posinset'?: number | undefined;
  /** Pressed state of a toggle button. */
  'aria-pressed'?: boolean | 'true' | 'false' | 'mixed' | undefined;
  /** The element is not editable but is otherwise operable. */
  'aria-readonly'?: boolean | 'true' | 'false' | undefined;
  /** What notifications a live region emits. */
  'aria-relevant'?: 'additions' | 'additions removals' | 'additions text' | 'all' | 'removals' | 'removals additions' | 'removals text' | 'text' | 'text additions' | 'text removals' | undefined;
  /** User input is required before submission. */
  'aria-required'?: boolean | 'true' | 'false' | undefined;
  /** Human-readable description of the element's role. */
  'aria-roledescription'?: string | undefined;
  /** Total number of rows in a table-like structure. */
  'aria-rowcount'?: number | undefined;
  /** Row index of the element within a table-like structure. */
  'aria-rowindex'?: number | undefined;
  /** Human-readable text alternative of `aria-rowindex`. */
  'aria-rowindextext'?: string | undefined;
  /** Number of rows spanned by a cell. */
  'aria-rowspan'?: number | undefined;
  /** Selected state of the element. */
  'aria-selected'?: boolean | 'true' | 'false' | undefined;
  /** Number of items in the current set. */
  'aria-setsize'?: number | undefined;
  /** Sort direction of a column or row. */
  'aria-sort'?: 'none' | 'ascending' | 'descending' | 'other' | undefined;
  /** Maximum allowed value of a range widget. */
  'aria-valuemax'?: number | undefined;
  /** Minimum allowed value of a range widget. */
  'aria-valuemin'?: number | undefined;
  /** Current value of a range widget. */
  'aria-valuenow'?: number | undefined;
  /** Human-readable text alternative of `aria-valuenow`. */
  'aria-valuetext'?: string | undefined;
}

/**
 * Every attribute Janux accepts on every intrinsic element: the Janux-specific
 * props (`dangerHTML`, `key`, `reset`, `data-input`), the HTML global
 * attributes and the WAI-ARIA surface. Per-tag interfaces extend this.
 */
export interface JanuxHTMLAttributes extends AriaAttributes {
  // ── janux ─────────────────────────────────────────────────────────────────
  /** Keys the element for the streaming diff, so state (an open island, a playing video) survives a re-render that reorders siblings. */
  key?: string | number;
  children?: unknown;
  /**
   * Injects a string as raw HTML inside the element — nothing is escaped, on
   * the server it streams as-is and on the client it lands via `innerHTML`.
   *
   * ⚠️ Never pass user-provided or remote content without sanitizing it first:
   * whatever you inject runs with the full power of the page (XSS).
   *
   * Example:
   *
   * ```tsx
   * <div dangerHTML={renderedMarkdown} />
   * ```
   *
   * Docs: https://janux.build/docs/guide/views-and-jsx#raw-html-dangerhtml
   */
  dangerHTML?: string;
  /** `<form onSubmit reset>`: the runtime empties the form once the intent has the values. */
  reset?: boolean;
  /** Extra intent input bound to this control, as a JSON object literal. Wins over event-derived facts. */
  'data-input'?: string;
  /** Any `data-*` attribute carries custom data to the DOM. https://developer.mozilla.org/docs/Web/HTML/Global_attributes/data-* */
  [dataAttribute: `data-${string}`]: unknown;

  // ── styling ───────────────────────────────────────────────────────────────
  /** Space-separated CSS class list. Janux accepts both `class` and the React spelling `className`; both render as `class`. */
  class?: string;
  /** React spelling of `class` — both render as the `class` attribute. */
  className?: string;
  /**
   * Inline style: CSS text or a typed style object (`CSSProperties`). An
   * object serializes camelCase → kebab-case (`backgroundColor` →
   * `background-color`), `--*` custom properties keep their casing, and an
   * empty object leaves no attribute behind. Unlike React, a bare number is
   * never given a unit: write `'10px'`, not `10`, when you mean pixels.
   *
   * Example:
   *
   * ```tsx
   * <div style={{ color: 'red', width: '10px' }} />
   * ```
   *
   * - [MDN reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/style)
   */
  style?: string | CSSProperties | undefined;

  // ── html global attributes ────────────────────────────────────────────────
  /** Keyboard shortcut hint to activate or focus the element. https://developer.mozilla.org/docs/Web/HTML/Global_attributes/accesskey */
  accessKey?: string;
  /** Whether and how text input is automatically capitalized. https://developer.mozilla.org/docs/Web/HTML/Global_attributes/autocapitalize */
  autoCapitalize?: 'off' | 'none' | 'on' | 'sentences' | 'words' | 'characters';
  /** The element should be focused on page load. https://developer.mozilla.org/docs/Web/HTML/Global_attributes/autofocus */
  autofocus?: boolean;
  /** The element's text is editable by the user. https://developer.mozilla.org/docs/Web/HTML/Global_attributes/contenteditable */
  contentEditable?: boolean | 'true' | 'false' | 'plaintext-only';
  /** Text directionality of the element's content. https://developer.mozilla.org/docs/Web/HTML/Global_attributes/dir */
  dir?: 'ltr' | 'rtl' | 'auto';
  /** The element can be dragged with the native drag and drop API. https://developer.mozilla.org/docs/Web/HTML/Global_attributes/draggable */
  draggable?: boolean | 'true' | 'false';
  /** Which action label (or icon) to show for the Enter key on virtual keyboards. https://developer.mozilla.org/docs/Web/HTML/Global_attributes/enterkeyhint */
  enterKeyHint?: 'enter' | 'done' | 'go' | 'next' | 'previous' | 'search' | 'send';
  /** Shadow-DOM parts exported for outside styling. https://developer.mozilla.org/docs/Web/HTML/Global_attributes/exportparts */
  exportparts?: string;
  /** The element is not (yet) relevant and is not rendered. https://developer.mozilla.org/docs/Web/HTML/Global_attributes/hidden */
  hidden?: boolean | 'until-found';
  /** Unique identifier of the element in the document. https://developer.mozilla.org/docs/Web/HTML/Global_attributes/id */
  id?: string;
  /** The element and its subtree are inert: no events, no focus, no selection. https://developer.mozilla.org/docs/Web/HTML/Global_attributes/inert */
  inert?: boolean;
  /** Virtual keyboard configuration hint for editable content. https://developer.mozilla.org/docs/Web/HTML/Global_attributes/inputmode */
  inputMode?: 'none' | 'text' | 'tel' | 'url' | 'email' | 'numeric' | 'decimal' | 'search';
  /** The custom element name a standard element behaves as. https://developer.mozilla.org/docs/Web/HTML/Global_attributes/is */
  is?: string;
  /** Microdata: unique global identifier of the item. https://developer.mozilla.org/docs/Web/HTML/Global_attributes/itemid */
  itemID?: string;
  /** Microdata: property name(s) the element supplies. https://developer.mozilla.org/docs/Web/HTML/Global_attributes/itemprop */
  itemProp?: string;
  /** Microdata: id list of additional elements of the item. https://developer.mozilla.org/docs/Web/HTML/Global_attributes/itemref */
  itemRef?: string;
  /** Microdata: the element is the scope of a new item. https://developer.mozilla.org/docs/Web/HTML/Global_attributes/itemscope */
  itemScope?: boolean;
  /** Microdata: URL(s) of the vocabulary describing the item. https://developer.mozilla.org/docs/Web/HTML/Global_attributes/itemtype */
  itemType?: string;
  /** Language of the element's content (BCP 47). https://developer.mozilla.org/docs/Web/HTML/Global_attributes/lang */
  lang?: string;
  /** Cryptographic nonce for the document's Content-Security-Policy. https://developer.mozilla.org/docs/Web/HTML/Global_attributes/nonce */
  nonce?: string;
  /** Shadow-DOM part name(s) targetable with `::part()`. https://developer.mozilla.org/docs/Web/HTML/Global_attributes/part */
  part?: string;
  /** Turns the element into a popover shown above the rest of the page. https://developer.mozilla.org/docs/Web/HTML/Global_attributes/popover */
  popover?: boolean | 'auto' | 'manual' | 'hint';
  /** WAI-ARIA role of the element. https://developer.mozilla.org/docs/Web/Accessibility/ARIA/Roles */
  role?: string;
  /** Named shadow-DOM slot the element is assigned to. https://developer.mozilla.org/docs/Web/HTML/Global_attributes/slot */
  slot?: string;
  /** Whether the element's editable content is spellchecked. https://developer.mozilla.org/docs/Web/HTML/Global_attributes/spellcheck */
  spellcheck?: boolean | 'true' | 'false';
  /** Focus order: `0` joins the sequential order, `-1` is focusable only programmatically. https://developer.mozilla.org/docs/Web/HTML/Global_attributes/tabindex */
  tabIndex?: number | string;
  /** Advisory text shown as a tooltip. https://developer.mozilla.org/docs/Web/HTML/Global_attributes/title */
  title?: string;
  /** Whether the element's content should be translated. https://developer.mozilla.org/docs/Web/HTML/Global_attributes/translate */
  translate?: 'yes' | 'no';
}
