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
 * A boolean-valued attribute that serializes as a literal `"true"`/`"false"`
 * token — ARIA and the enumerated attributes read absence differently from
 * false, so these never get the bare-attribute/omitted treatment.
 */
export type Booleanish = boolean | 'true' | 'false';

/** A WAI-ARIA role. The union lists the ARIA 1.2 roles; any string is allowed for forward compatibility. */
export type AriaRole =
  | 'alert'
  | 'alertdialog'
  | 'application'
  | 'article'
  | 'banner'
  | 'blockquote'
  | 'button'
  | 'caption'
  | 'cell'
  | 'checkbox'
  | 'code'
  | 'columnheader'
  | 'combobox'
  | 'complementary'
  | 'contentinfo'
  | 'definition'
  | 'deletion'
  | 'dialog'
  | 'document'
  | 'emphasis'
  | 'feed'
  | 'figure'
  | 'form'
  | 'generic'
  | 'grid'
  | 'gridcell'
  | 'group'
  | 'heading'
  | 'img'
  | 'insertion'
  | 'link'
  | 'list'
  | 'listbox'
  | 'listitem'
  | 'log'
  | 'main'
  | 'marquee'
  | 'math'
  | 'menu'
  | 'menubar'
  | 'menuitem'
  | 'menuitemcheckbox'
  | 'menuitemradio'
  | 'meter'
  | 'navigation'
  | 'none'
  | 'note'
  | 'option'
  | 'paragraph'
  | 'presentation'
  | 'progressbar'
  | 'radio'
  | 'radiogroup'
  | 'region'
  | 'row'
  | 'rowgroup'
  | 'rowheader'
  | 'scrollbar'
  | 'search'
  | 'searchbox'
  | 'separator'
  | 'slider'
  | 'spinbutton'
  | 'status'
  | 'strong'
  | 'subscript'
  | 'superscript'
  | 'switch'
  | 'tab'
  | 'table'
  | 'tablist'
  | 'tabpanel'
  | 'term'
  | 'textbox'
  | 'time'
  | 'timer'
  | 'toolbar'
  | 'tooltip'
  | 'tree'
  | 'treegrid'
  | 'treeitem'
  | (string & {});

/**
 * WAI-ARIA states and properties, valid on every element.
 * https://developer.mozilla.org/docs/Web/Accessibility/ARIA/Attributes
 */
export interface AriaAttributes {
  /** Identifies the currently active descendant of a composite widget. */
  'aria-activedescendant'?: string;
  /** Whether assistive tech presents the whole changed region, not just the delta. */
  'aria-atomic'?: Booleanish;
  /** How input completion suggestions are presented. */
  'aria-autocomplete'?: 'none' | 'inline' | 'list' | 'both';
  /** Braille label for the element. */
  'aria-braillelabel'?: string;
  /** Braille role description for the element. */
  'aria-brailleroledescription'?: string;
  /** The element is being modified; assistive tech may wait to announce it. */
  'aria-busy'?: Booleanish;
  /** Checked state of checkboxes, radios and other widgets. */
  'aria-checked'?: Booleanish | 'mixed';
  /** Total number of columns in a table-like structure. */
  'aria-colcount'?: number;
  /** Column index of the element within a table-like structure. */
  'aria-colindex'?: number;
  /** Human-readable text alternative of `aria-colindex`. */
  'aria-colindextext'?: string;
  /** Number of columns spanned by a cell. */
  'aria-colspan'?: number;
  /** id list of the elements whose contents or presence this element controls. */
  'aria-controls'?: string;
  /** Marks the element that represents the current item within a set. */
  'aria-current'?: Booleanish | 'page' | 'step' | 'location' | 'date' | 'time';
  /** id list of the elements that describe this one. */
  'aria-describedby'?: string;
  /** Plain-text description of the element. */
  'aria-description'?: string;
  /** id of the element providing an extended description. */
  'aria-details'?: string;
  /** The element is perceivable but disabled. */
  'aria-disabled'?: Booleanish;
  /** id of the element carrying the current error message. */
  'aria-errormessage'?: string;
  /** Whether the controlled grouping element is expanded. */
  'aria-expanded'?: Booleanish;
  /** id list defining an alternate reading order. */
  'aria-flowto'?: string;
  /** Kind of popup triggered by the element. */
  'aria-haspopup'?: Booleanish | 'menu' | 'listbox' | 'tree' | 'grid' | 'dialog';
  /** The element is not exposed to the accessibility tree. */
  'aria-hidden'?: Booleanish;
  /** The entered value does not conform to the expected format. */
  'aria-invalid'?: Booleanish | 'grammar' | 'spelling';
  /** Keyboard shortcuts that activate the element. */
  'aria-keyshortcuts'?: string;
  /** String label for the element. */
  'aria-label'?: string;
  /** id list of the elements that label this one. */
  'aria-labelledby'?: string;
  /** Hierarchical level of the element (headings, tree items…). */
  'aria-level'?: number;
  /** Politeness level for live-region updates. */
  'aria-live'?: 'off' | 'assertive' | 'polite';
  /** The element is modal when displayed. */
  'aria-modal'?: Booleanish;
  /** The text box accepts multiple lines of input. */
  'aria-multiline'?: Booleanish;
  /** More than one item may be selected. */
  'aria-multiselectable'?: Booleanish;
  /** Orientation of the element. */
  'aria-orientation'?: 'horizontal' | 'vertical';
  /** id list of children not expressible in the DOM hierarchy. */
  'aria-owns'?: string;
  /** Short hint intended to aid data entry. */
  'aria-placeholder'?: string;
  /** Position of the item within the current set. */
  'aria-posinset'?: number;
  /** Pressed state of a toggle button. */
  'aria-pressed'?: Booleanish | 'mixed';
  /** The element is not editable but is otherwise operable. */
  'aria-readonly'?: Booleanish;
  /** What notifications a live region emits. */
  'aria-relevant'?: 'additions' | 'additions removals' | 'additions text' | 'all' | 'removals' | 'removals additions' | 'removals text' | 'text' | 'text additions' | 'text removals';
  /** User input is required before submission. */
  'aria-required'?: Booleanish;
  /** Human-readable description of the element's role. */
  'aria-roledescription'?: string;
  /** Total number of rows in a table-like structure. */
  'aria-rowcount'?: number;
  /** Row index of the element within a table-like structure. */
  'aria-rowindex'?: number;
  /** Human-readable text alternative of `aria-rowindex`. */
  'aria-rowindextext'?: string;
  /** Number of rows spanned by a cell. */
  'aria-rowspan'?: number;
  /** Selected state of the element. */
  'aria-selected'?: Booleanish;
  /** Number of items in the current set. */
  'aria-setsize'?: number;
  /** Sort direction of a column or row. */
  'aria-sort'?: 'none' | 'ascending' | 'descending' | 'other';
  /** Maximum allowed value of a range widget. */
  'aria-valuemax'?: number;
  /** Minimum allowed value of a range widget. */
  'aria-valuemin'?: number;
  /** Current value of a range widget. */
  'aria-valuenow'?: number;
  /** Human-readable text alternative of `aria-valuenow`. */
  'aria-valuetext'?: string;
}

/**
 * The attribute surface HTML and SVG elements share: the Janux-specific props
 * (`dangerHTML`, `key`, `data-input`), styling, ARIA and the global
 * attributes that exist in both languages.
 */
export interface JanuxCoreAttributes extends AriaAttributes {
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
  style?: string | CSSProperties;

  // ── globals shared by html and svg ────────────────────────────────────────
  /** The element should be focused on page load. https://developer.mozilla.org/docs/Web/HTML/Global_attributes/autofocus */
  autofocus?: boolean;
  /** Unique identifier of the element in the document. https://developer.mozilla.org/docs/Web/HTML/Global_attributes/id */
  id?: string;
  /** Language of the element's content (BCP 47). https://developer.mozilla.org/docs/Web/HTML/Global_attributes/lang */
  lang?: string;
  /** Cryptographic nonce for the document's Content-Security-Policy. https://developer.mozilla.org/docs/Web/HTML/Global_attributes/nonce */
  nonce?: string;
  /** Shadow-DOM part name(s) targetable with `::part()`. https://developer.mozilla.org/docs/Web/HTML/Global_attributes/part */
  part?: string;
  /** Shadow-DOM parts exported for outside styling. https://developer.mozilla.org/docs/Web/HTML/Global_attributes/exportparts */
  exportparts?: string;
  /** WAI-ARIA role of the element. https://developer.mozilla.org/docs/Web/Accessibility/ARIA/Roles */
  role?: AriaRole;
  /** Named shadow-DOM slot the element is assigned to. https://developer.mozilla.org/docs/Web/HTML/Global_attributes/slot */
  slot?: string;
  /** Focus order: `0` joins the sequential order, `-1` is focusable only programmatically. https://developer.mozilla.org/docs/Web/HTML/Global_attributes/tabindex */
  tabIndex?: number | string;
}

/**
 * Every attribute Janux accepts on every HTML element: the shared core above
 * plus the HTML-only global attributes. Per-tag interfaces extend this.
 */
export interface JanuxHTMLAttributes extends JanuxCoreAttributes {
  /** Keyboard shortcut hint to activate or focus the element. https://developer.mozilla.org/docs/Web/HTML/Global_attributes/accesskey */
  accessKey?: string;
  /** Whether and how text input is automatically capitalized. https://developer.mozilla.org/docs/Web/HTML/Global_attributes/autocapitalize */
  autoCapitalize?: 'off' | 'none' | 'on' | 'sentences' | 'words' | 'characters';
  /** The element's text is editable by the user. https://developer.mozilla.org/docs/Web/HTML/Global_attributes/contenteditable */
  contentEditable?: Booleanish | 'plaintext-only';
  /** Text directionality of the element's content. https://developer.mozilla.org/docs/Web/HTML/Global_attributes/dir */
  dir?: 'ltr' | 'rtl' | 'auto';
  /** The element can be dragged with the native drag and drop API. https://developer.mozilla.org/docs/Web/HTML/Global_attributes/draggable */
  draggable?: Booleanish;
  /** Which action label (or icon) to show for the Enter key on virtual keyboards. https://developer.mozilla.org/docs/Web/HTML/Global_attributes/enterkeyhint */
  enterKeyHint?: 'enter' | 'done' | 'go' | 'next' | 'previous' | 'search' | 'send';
  /** The element is not (yet) relevant and is not rendered. https://developer.mozilla.org/docs/Web/HTML/Global_attributes/hidden */
  hidden?: boolean | 'until-found';
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
  /** Turns the element into a popover shown above the rest of the page. https://developer.mozilla.org/docs/Web/HTML/Global_attributes/popover */
  popover?: boolean | 'auto' | 'manual' | 'hint';
  /** Whether the element's editable content is spellchecked. https://developer.mozilla.org/docs/Web/HTML/Global_attributes/spellcheck */
  spellcheck?: Booleanish;
  /** Advisory text shown as a tooltip. https://developer.mozilla.org/docs/Web/HTML/Global_attributes/title */
  title?: string;
  /** Whether the element's content should be translated. https://developer.mozilla.org/docs/Web/HTML/Global_attributes/translate */
  translate?: 'yes' | 'no';
}
