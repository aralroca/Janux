import type { Case } from '../support/case';
import type { Intents } from './harness';

/**
 * The wire format of a bound event: what `on*={intents.x}` leaves in the HTML.
 *
 * Resumability lives or dies here — a handler must be expressible as a static
 * marker a delegated listener can resolve, with no closure anywhere. Each row
 * renders ONE element and pins exactly the attributes it carries, so a marker
 * that silently changes name, doubles up, or leaks an executable `on*`
 * attribute into the markup fails the corpus.
 */
export interface WireCase {
  /** Props of the single element the island renders. `i` is the island's intents (`go`, `other`). */
  props: (i: Intents) => Record<string, unknown>;
  /** Exactly the attribute text of the rendered element — everything between the tag name and `>`. */
  expected: string;
  /** The element to render. Default `b`, which no runtime rule treats specially. */
  tag?: string;
  /** Developer warnings the render must emit, in order. */
  warns?: string[];
}

export type WireRow = Case<WireCase>;

const GO = 'w#default:go';
const OTHER = 'w#default:other';

export const MARKER_WIRE_CASES: WireRow[] = [
  // ── the two v0 markers ─────────────────────────────────────────────────────
  {
    id: 'evt-onclick-emits-the-v0-data-jxa-marker',
    src: 'janux',
    props: (i) => ({ onClick: i.go }),
    expected: ` data-jxa="${GO}"`,
  },
  {
    id: 'evt-onsubmit-emits-the-v0-data-jxform-marker',
    src: 'janux',
    tag: 'form',
    props: (i) => ({ onSubmit: i.go }),
    expected: ` data-jxform="${GO}"`,
  },
  {
    id: 'evt-the-submit-marker-does-not-depend-on-the-tag-being-a-form',
    src: 'janux',
    props: (i) => ({ onSubmit: i.go }),
    expected: ` data-jxform="${GO}"`,
  },
  {
    id: 'evt-click-and-submit-on-one-element-keep-their-separate-markers',
    src: 'janux',
    tag: 'form',
    props: (i) => ({ onClick: i.other, onSubmit: i.go }),
    expected: ` data-jxa="${OTHER}" data-jxform="${GO}"`,
  },

  // ── every other event: data-jxe-<type> ─────────────────────────────────────
  {
    id: 'evt-oninput-marker-is-the-lowercased-event-name',
    src: 'janux',
    tag: 'input',
    props: (i) => ({ onInput: i.go }),
    expected: ` data-jxe-input="${GO}"`,
  },
  {
    id: 'evt-onchange-marker',
    src: 'janux',
    tag: 'input',
    props: (i) => ({ onChange: i.go }),
    expected: ` data-jxe-change="${GO}"`,
  },
  {
    id: 'evt-ondoubleclick-maps-to-the-dblclick-marker',
    src: 'react:SimpleEventPlugin#onDoubleClick',
    props: (i) => ({ onDoubleClick: i.go }),
    expected: ` data-jxe-dblclick="${GO}"`,
  },
  {
    id: 'evt-ondblclick-is-the-preact-spelling-of-the-same-marker',
    src: 'preact:events#onDblClick',
    props: (i) => ({ onDblClick: i.go }),
    expected: ` data-jxe-dblclick="${GO}"`,
  },
  {
    id: 'evt-onfocus-delegates-through-the-bubbling-focusin',
    src: 'react:SimpleEventPlugin#focus-focusin',
    props: (i) => ({ onFocus: i.go }),
    expected: ` data-jxe-focusin="${GO}"`,
  },
  {
    id: 'evt-onblur-delegates-through-the-bubbling-focusout',
    src: 'react:SimpleEventPlugin#blur-focusout',
    props: (i) => ({ onBlur: i.go }),
    expected: ` data-jxe-focusout="${GO}"`,
  },
  {
    id: 'evt-onfocusin-spelled-natively-lands-on-the-same-marker-as-onfocus',
    src: 'janux',
    props: (i) => ({ onFocusIn: i.go }),
    expected: ` data-jxe-focusin="${GO}"`,
  },
  {
    id: 'evt-onkeydown-marker',
    src: 'janux',
    props: (i) => ({ onKeyDown: i.go }),
    expected: ` data-jxe-keydown="${GO}"`,
  },
  {
    id: 'evt-onkeyup-marker',
    src: 'janux',
    props: (i) => ({ onKeyUp: i.go }),
    expected: ` data-jxe-keyup="${GO}"`,
  },
  {
    id: 'evt-onmouseenter-marker-for-a-non-bubbling-event',
    src: 'janux',
    props: (i) => ({ onMouseEnter: i.go }),
    expected: ` data-jxe-mouseenter="${GO}"`,
  },
  {
    id: 'evt-onmouseleave-marker',
    src: 'janux',
    props: (i) => ({ onMouseLeave: i.go }),
    expected: ` data-jxe-mouseleave="${GO}"`,
  },
  {
    id: 'evt-onmousemove-marker',
    src: 'janux',
    props: (i) => ({ onMouseMove: i.go }),
    expected: ` data-jxe-mousemove="${GO}"`,
  },
  {
    id: 'evt-onpointerdown-marker',
    src: 'janux',
    props: (i) => ({ onPointerDown: i.go }),
    expected: ` data-jxe-pointerdown="${GO}"`,
  },
  {
    id: 'evt-onpointercancel-marker',
    src: 'janux',
    props: (i) => ({ onPointerCancel: i.go }),
    expected: ` data-jxe-pointercancel="${GO}"`,
  },
  {
    id: 'evt-oncontextmenu-marker',
    src: 'janux',
    props: (i) => ({ onContextMenu: i.go }),
    expected: ` data-jxe-contextmenu="${GO}"`,
  },
  {
    id: 'evt-onwheel-marker',
    src: 'janux',
    props: (i) => ({ onWheel: i.go }),
    expected: ` data-jxe-wheel="${GO}"`,
  },
  {
    id: 'evt-onscroll-marker-for-an-event-that-does-not-bubble',
    src: 'janux',
    props: (i) => ({ onScroll: i.go }),
    expected: ` data-jxe-scroll="${GO}"`,
  },
  {
    id: 'evt-ontoggle-marker-on-a-details-element',
    src: 'janux',
    tag: 'details',
    props: (i) => ({ onToggle: i.go }),
    expected: ` data-jxe-toggle="${GO}"`,
  },
  {
    id: 'evt-clipboard-copy-marker',
    src: 'janux',
    props: (i) => ({ onCopy: i.go }),
    expected: ` data-jxe-copy="${GO}"`,
  },
  {
    id: 'evt-clipboard-cut-and-paste-markers-coexist',
    src: 'janux',
    props: (i) => ({ onCut: i.go, onPaste: i.other }),
    expected: ` data-jxe-cut="${GO}" data-jxe-paste="${OTHER}"`,
  },
  {
    id: 'evt-ontouchstart-marker',
    src: 'janux',
    props: (i) => ({ onTouchStart: i.go }),
    expected: ` data-jxe-touchstart="${GO}"`,
  },
  {
    id: 'evt-ontouchcancel-marker',
    src: 'janux',
    props: (i) => ({ onTouchCancel: i.go }),
    expected: ` data-jxe-touchcancel="${GO}"`,
  },
  {
    id: 'evt-onanimationiteration-marker',
    src: 'janux',
    props: (i) => ({ onAnimationIteration: i.go }),
    expected: ` data-jxe-animationiteration="${GO}"`,
  },
  {
    id: 'evt-ontransitionend-marker',
    src: 'janux',
    props: (i) => ({ onTransitionEnd: i.go }),
    expected: ` data-jxe-transitionend="${GO}"`,
  },
  {
    id: 'evt-oninvalid-marker',
    src: 'janux',
    tag: 'input',
    props: (i) => ({ onInvalid: i.go }),
    expected: ` data-jxe-invalid="${GO}"`,
  },
  {
    id: 'evt-onselect-marker',
    src: 'janux',
    tag: 'input',
    props: (i) => ({ onSelect: i.go }),
    expected: ` data-jxe-select="${GO}"`,
  },

  // ── the namespace is open, not an allowlist ────────────────────────────────
  {
    id: 'evt-an-unlisted-media-event-still-gets-a-marker',
    src: 'janux',
    tag: 'video',
    props: (i) => ({ onCanPlay: i.go }),
    expected: ` data-jxe-canplay="${GO}"`,
  },
  {
    id: 'evt-a-multi-word-unlisted-event-lowercases-into-one-token',
    src: 'janux',
    tag: 'video',
    props: (i) => ({ onLoadedMetadata: i.go }),
    expected: ` data-jxe-loadedmetadata="${GO}"`,
  },
  {
    id: 'evt-onauxclick-is-not-a-special-case-of-click',
    src: 'janux',
    props: (i) => ({ onAuxClick: i.go }),
    expected: ` data-jxe-auxclick="${GO}"`,
  },
  {
    id: 'evt-onbeforeinput-marker',
    src: 'janux',
    tag: 'input',
    props: (i) => ({ onBeforeInput: i.go }),
    expected: ` data-jxe-beforeinput="${GO}"`,
  },
  {
    id: 'evt-a-made-up-event-name-gets-its-marker-like-any-other',
    src: 'janux',
    props: (i) => ({ onFoo: i.go }),
    expected: ` data-jxe-foo="${GO}"`,
  },
  {
    id: 'evt-a-single-letter-event-name-is-still-an-event-prop',
    src: 'janux',
    props: (i) => ({ onX: i.go }),
    expected: ` data-jxe-x="${GO}"`,
  },
  {
    id: 'evt-a-react-style-capture-suffix-is-not-a-phase-it-is-an-event-name',
    src: 'react:DOMPluginEventSystem#capture-phase-props',
    props: (i) => ({ onClickCapture: i.go }),
    expected: ` data-jxe-clickcapture="${GO}"`,
  },
  {
    // A derived event name must be safe inside an attribute name, so a bound
    // intent whose event name is not pure ASCII letters is refused — it falls
    // through to the on*-namespace rule, warning included.
    id: 'evt-an-event-name-with-a-non-ascii-letter-is-refused-entirely',
    src: 'janux',
    props: (i) => ({ onÑandu: i.go }),
    expected: '',
    warns: ['Janux: "onÑandu" expects a named intent — a plain function has no name, schema or guard, so it was dropped'],
  },
  {
    id: 'evt-an-event-name-carrying-a-digit-is-refused-entirely',
    src: 'janux',
    props: (i) => ({ onKey1: i.go }),
    expected: '',
    warns: ['Janux: "onKey1" expects a named intent — a plain function has no name, schema or guard, so it was dropped'],
  },

  // ── the whole on* namespace is reserved ────────────────────────────────────
  {
    id: 'evt-a-plain-function-handler-is-dropped-with-a-warning',
    src: 'janux',
    props: () => ({ onClick: () => undefined }),
    expected: '',
    warns: ['Janux: "onClick" expects a named intent — a plain function has no name, schema or guard, so it was dropped'],
  },
  {
    id: 'evt-a-string-handler-never-reaches-the-markup-as-an-inline-attribute',
    src: 'janux',
    props: () => ({ onClick: 'alert(1)' }),
    expected: '',
  },
  {
    id: 'evt-a-lowercase-onclick-string-is-refused-like-the-jsx-spelling',
    src: 'janux',
    props: () => ({ onclick: 'alert(1)' }),
    expected: '',
  },
  {
    id: 'evt-an-uppercase-onclick-string-is-refused-too-the-prefix-match-is-case-insensitive',
    src: 'janux',
    props: () => ({ ONCLICK: 'alert(1)' }),
    expected: '',
  },
  {
    id: 'evt-an-undefined-event-prop-leaves-nothing-behind-and-says-nothing',
    src: 'janux',
    props: () => ({ onClick: undefined }),
    expected: '',
  },
  {
    id: 'evt-a-number-handler-is-dropped-silently',
    src: 'janux',
    props: () => ({ onClick: 42 }),
    expected: '',
  },
  {
    id: 'evt-the-removed-on-prop-warns-and-emits-no-marker',
    src: 'janux',
    props: (i) => ({ on: i.go }),
    expected: '',
    warns: ['Janux: "on" was removed — bind the event by name instead: onClick, onSubmit, …'],
  },
  {
    id: 'evt-the-removed-intent-prop-warns-and-emits-no-marker',
    src: 'janux',
    props: (i) => ({ intent: i.go }),
    expected: '',
    warns: ['Janux: "intent" was removed — bind the event by name instead: onClick, onSubmit, …'],
  },
  {
    id: 'evt-a-plain-string-in-the-removed-on-prop-is-dropped-without-a-warning',
    src: 'janux',
    props: () => ({ on: 'click' }),
    expected: '',
  },
  {
    // Preact renders `once` as an ordinary attribute: it is not `on` + an
    // uppercase letter, so it is not an event prop. Janux still drops it —
    // the reservation is the whole `on*` prefix, case-insensitively, because
    // that is the set the browser can read back as an inline handler.
    id: 'evt-a-non-event-prop-starting-with-on-is-dropped-anyway',
    src: 'preact:events#not-an-event-prop',
    props: () => ({ once: 'yes' }),
    expected: '',
  },
  {
    id: 'evt-the-reservation-also-swallows-the-word-online',
    src: 'janux',
    props: () => ({ online: 'true' }),
    expected: '',
  },
  {
    id: 'evt-onerror-can-never-reach-the-markup-as-an-attribute',
    src: 'janux',
    tag: 'img',
    props: () => ({ src: '/a.png', onerror: 'alert(1)' }),
    expected: ' src="/a.png"',
  },

  // ── alias collisions on one marker ─────────────────────────────────────────
  {
    id: 'evt-onfocus-and-onfocusin-collide-and-the-first-prop-wins',
    src: 'janux',
    props: (i) => ({ onFocus: i.go, onFocusIn: i.other }),
    expected: ` data-jxe-focusin="${GO}"`,
    warns: ['Janux: two event props resolve to the same marker "data-jxe-focusin" — the first one wins'],
  },
  {
    id: 'evt-ondoubleclick-and-ondblclick-collide-and-the-first-prop-wins',
    src: 'janux',
    props: (i) => ({ onDblClick: i.other, onDoubleClick: i.go }),
    expected: ` data-jxe-dblclick="${OTHER}"`,
    warns: ['Janux: two event props resolve to the same marker "data-jxe-dblclick" — the first one wins'],
  },
  {
    id: 'evt-onblur-and-onfocusout-collide-on-the-focusout-marker',
    src: 'janux',
    props: (i) => ({ onFocusOut: i.go, onBlur: i.other }),
    expected: ` data-jxe-focusout="${GO}"`,
    warns: ['Janux: two event props resolve to the same marker "data-jxe-focusout" — the first one wins'],
  },
  {
    id: 'evt-two-different-events-on-one-element-do-not-collide',
    src: 'janux',
    props: (i) => ({ onFocus: i.go, onBlur: i.other }),
    expected: ` data-jxe-focusin="${GO}" data-jxe-focusout="${OTHER}"`,
  },
  {
    id: 'evt-the-same-intent-bound-to-two-events-emits-two-markers',
    src: 'janux',
    props: (i) => ({ onClick: i.go, onKeyDown: i.go }),
    expected: ` data-jxa="${GO}" data-jxe-keydown="${GO}"`,
  },

  // ── the marker's neighbours ────────────────────────────────────────────────
  {
    id: 'evt-markers-are-emitted-in-prop-order-among-ordinary-attributes',
    src: 'janux',
    props: (i) => ({ class: 'row', onClick: i.go, id: 'first' }),
    expected: ` class="row" data-jxa="${GO}" id="first"`,
  },
  {
    id: 'evt-a-marker-lives-happily-on-a-void-element',
    src: 'janux',
    tag: 'input',
    props: (i) => ({ type: 'checkbox', onChange: i.go }),
    expected: ` type="checkbox" data-jxe-change="${GO}"`,
  },
  {
    id: 'evt-an-explicit-data-input-is-preserved-verbatim-next-to-the-marker',
    src: 'janux',
    props: (i) => ({ onClick: i.go, 'data-input': '{"id":"x"}' }),
    expected: ` data-jxa="${GO}" data-input="{&quot;id&quot;:&quot;x&quot;}"`,
  },
  {
    id: 'evt-form-reset-becomes-the-data-jxreset-flag',
    src: 'janux',
    tag: 'form',
    props: (i) => ({ onSubmit: i.go, reset: true }),
    expected: ` data-jxform="${GO}" data-jxreset=""`,
  },
  {
    id: 'evt-form-reset-false-leaves-no-flag',
    src: 'janux',
    tag: 'form',
    props: (i) => ({ onSubmit: i.go, reset: false }),
    expected: ` data-jxform="${GO}"`,
  },
  {
    id: 'evt-reset-is-a-runtime-flag-not-an-attribute-so-a-string-value-drops-it',
    src: 'janux',
    tag: 'form',
    props: (i) => ({ onSubmit: i.go, reset: 'yes' }),
    expected: ` data-jxform="${GO}"`,
  },
  {
    id: 'evt-a-marked-anchor-keeps-its-href-the-runtime-cancels-the-navigation-not-the-render',
    src: 'janux',
    tag: 'a',
    props: (i) => ({ href: '/somewhere', onClick: i.go }),
    expected: ` href="/somewhere" data-jxa="${GO}"`,
  },
  {
    id: 'evt-an-executable-href-is-still-blocked-on-a-marked-element',
    src: 'janux',
    tag: 'a',
    props: (i) => ({ href: 'javascript:alert(1)', onClick: i.go }),
    expected: ` data-jxa="${GO}"`,
    warns: ['Janux: blocked an executable URL in "href" — javascript:alert(1)'],
  },
];
