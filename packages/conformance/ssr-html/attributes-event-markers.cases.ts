import type { AttrRow } from './attributes.cases';

/**
 * The `on*` → delegation-marker wire format, event by event.
 *
 * The client runtime resolves `data-jxe-<event>` markers back to DOM event
 * names, so every mapping row here pins one entry of that wire format — the
 * same reason React tests its event registration table. The generic rule is
 * `slice(2).toLowerCase()`, which is exactly why each row matters: a future
 * "helpful" exception (as focus/blur and dblclick already are) is a silent
 * protocol change for every page already in a browser cache.
 */

/** A bound intent as the runtime hands it to a view. */
const ref = (component: string, name: string, key?: string) => ({
  $intent: { component, name, ...(key === undefined ? {} : { key }) },
});

/** The same intent after `.with(input)`. */
const bound = (marker: ReturnType<typeof ref>, input: Record<string, unknown>) => ({ ...marker, $input: input });

/** One mapping row: the JSX prop and the event name its marker must carry. */
const maps = (prop: string, event: string): AttrRow => ({
  id: `marker-${prop.slice(2).toLowerCase()}-maps-to-${event}`,
  src: 'janux',
  props: { [prop]: ref('app', 'go') },
  expected: ` data-jxe-${event}="app:go"`,
});

export const EVENT_MARKER_CASES: AttrRow[] = [
  // ── pointer and mouse ───────────────────────────────────────────────────────
  maps('onPointerOver', 'pointerover'),
  maps('onPointerOut', 'pointerout'),
  maps('onPointerEnter', 'pointerenter'),
  maps('onPointerLeave', 'pointerleave'),
  maps('onPointerCancel', 'pointercancel'),
  maps('onPointerRawUpdate', 'pointerrawupdate'),
  maps('onGotPointerCapture', 'gotpointercapture'),
  maps('onLostPointerCapture', 'lostpointercapture'),
  maps('onMouseDown', 'mousedown'),
  maps('onMouseUp', 'mouseup'),
  maps('onMouseMove', 'mousemove'),
  maps('onMouseOver', 'mouseover'),
  maps('onMouseOut', 'mouseout'),
  maps('onMouseLeave', 'mouseleave'),
  maps('onAuxClick', 'auxclick'),
  maps('onContextMenu', 'contextmenu'),
  maps('onWheel', 'wheel'),
  // Legacy spelling, mapped generically — NOT aliased onto `wheel`.
  maps('onMouseWheel', 'mousewheel'),

  // ── touch ───────────────────────────────────────────────────────────────────
  maps('onTouchStart', 'touchstart'),
  maps('onTouchMove', 'touchmove'),
  maps('onTouchEnd', 'touchend'),
  maps('onTouchCancel', 'touchcancel'),

  // ── keyboard, input and composition ─────────────────────────────────────────
  maps('onKeyPress', 'keypress'),
  maps('onBeforeInput', 'beforeinput'),
  maps('onCompositionStart', 'compositionstart'),
  maps('onCompositionUpdate', 'compositionupdate'),
  maps('onCompositionEnd', 'compositionend'),

  // ── drag and drop ───────────────────────────────────────────────────────────
  maps('onDragStart', 'dragstart'),
  maps('onDrag', 'drag'),
  maps('onDragEnter', 'dragenter'),
  maps('onDragOver', 'dragover'),
  maps('onDragLeave', 'dragleave'),
  maps('onDrop', 'drop'),
  maps('onDragEnd', 'dragend'),

  // ── clipboard and selection ─────────────────────────────────────────────────
  maps('onCut', 'cut'),
  maps('onCopy', 'copy'),
  maps('onPaste', 'paste'),
  maps('onSelect', 'select'),
  maps('onSelectionChange', 'selectionchange'),

  // ── scroll, animation and transition ────────────────────────────────────────
  maps('onScroll', 'scroll'),
  maps('onScrollEnd', 'scrollend'),
  maps('onAnimationStart', 'animationstart'),
  maps('onAnimationIteration', 'animationiteration'),
  maps('onAnimationEnd', 'animationend'),
  maps('onTransitionRun', 'transitionrun'),
  maps('onTransitionStart', 'transitionstart'),
  maps('onTransitionCancel', 'transitioncancel'),
  maps('onTransitionEnd', 'transitionend'),
  // A vendor-prefixed event camel-cases like anything else.
  maps('onWebkitAnimationEnd', 'webkitanimationend'),

  // ── media, the full set ─────────────────────────────────────────────────────
  maps('onAbort', 'abort'),
  maps('onCanPlay', 'canplay'),
  maps('onCanPlayThrough', 'canplaythrough'),
  maps('onDurationChange', 'durationchange'),
  maps('onEmptied', 'emptied'),
  maps('onEnded', 'ended'),
  maps('onLoadedData', 'loadeddata'),
  maps('onLoadedMetadata', 'loadedmetadata'),
  maps('onLoadStart', 'loadstart'),
  maps('onPause', 'pause'),
  maps('onPlay', 'play'),
  maps('onPlaying', 'playing'),
  maps('onProgress', 'progress'),
  maps('onRateChange', 'ratechange'),
  maps('onSeeked', 'seeked'),
  maps('onSeeking', 'seeking'),
  maps('onStalled', 'stalled'),
  maps('onSuspend', 'suspend'),
  maps('onTimeUpdate', 'timeupdate'),
  maps('onVolumeChange', 'volumechange'),
  maps('onWaiting', 'waiting'),
  maps('onCueChange', 'cuechange'),

  // ── resources, forms and interactive elements ───────────────────────────────
  maps('onLoad', 'load'),
  maps('onError', 'error'),
  maps('onToggle', 'toggle'),
  maps('onBeforeToggle', 'beforetoggle'),
  maps('onClose', 'close'),
  maps('onCancel', 'cancel'),
  maps('onInvalid', 'invalid'),
  // The `reset` DOM event is distinct from the `reset` marker prop (`data-jxreset`).
  maps('onReset', 'reset'),
  maps('onSearch', 'search'),
  maps('onSlotChange', 'slotchange'),
  maps('onFullscreenChange', 'fullscreenchange'),
  maps('onFullscreenError', 'fullscreenerror'),
  maps('onSecurityPolicyViolation', 'securitypolicyviolation'),

  // ── window/document-level events map the same way; where they can be
  // listened for is the delegation runtime's concern, not the serializer's ───
  maps('onHashChange', 'hashchange'),
  maps('onPopState', 'popstate'),
  maps('onPageShow', 'pageshow'),
  maps('onPageHide', 'pagehide'),
  maps('onBeforeUnload', 'beforeunload'),
  maps('onUnload', 'unload'),
  maps('onStorage', 'storage'),
  maps('onOnline', 'online'),
  maps('onOffline', 'offline'),
  maps('onLanguageChange', 'languagechange'),
  maps('onMessage', 'message'),
  maps('onMessageError', 'messageerror'),
  maps('onRejectionHandled', 'rejectionhandled'),
  maps('onUnhandledRejection', 'unhandledrejection'),
  maps('onVisibilityChange', 'visibilitychange'),
  maps('onResize', 'resize'),
  maps('onDeviceMotion', 'devicemotion'),
  maps('onDeviceOrientation', 'deviceorientation'),

  // ── name-shape edges ────────────────────────────────────────────────────────
  { id: 'marker-all-caps-click-still-maps-to-jxa', src: 'janux', props: { onCLICK: ref('menu', 'pick') }, expected: ' data-jxa="menu:pick"' },
  { id: 'marker-all-caps-submit-still-maps-to-jxform', src: 'janux', props: { onSUBMIT: ref('menu', 'send') }, expected: ' data-jxform="menu:send"' },
  { id: 'marker-single-letter-event-name', src: 'janux', props: { onA: ref('menu', 'a') }, expected: ' data-jxe-a="menu:a"' },
  { id: 'marker-digit-in-the-event-name-is-refused', src: 'janux', props: { onClick2: ref('menu', 'x') }, expected: '' },
  { id: 'marker-lowercase-onclick-is-not-an-event-prop', src: 'janux', props: { onclick: ref('menu', 'x') }, expected: '' },
  { id: 'marker-capital-o-nclick-is-not-an-event-prop', src: 'janux', props: { Onclick: ref('menu', 'x') }, expected: '' },
  { id: 'marker-once-never-reaches-the-markup', src: 'janux', props: { once: true }, expected: '' },
  { id: 'marker-onward-never-reaches-the-markup', src: 'janux', props: { onward: 'ho' }, expected: '' },

  // ── the intent marker's own contents ────────────────────────────────────────
  { id: 'marker-submit-intent-with-key', src: 'janux', props: { onSubmit: ref('checkout', 'pay', 'main') }, expected: ' data-jxform="checkout#main:pay"' },
  { id: 'marker-generic-event-intent-with-key', src: 'janux', props: { onKeyDown: ref('sheet', 'entry', 'r1') }, expected: ' data-jxe-keydown="sheet#r1:entry"' },
  { id: 'marker-escapes-a-hostile-intent-name', src: 'janux', props: { onKeyUp: ref('sheet', 'a"b') }, expected: ' data-jxe-keyup="sheet:a&quot;b"' },
  { id: 'marker-keeps-its-position-between-attributes', src: 'janux', props: { type: 'button', onClick: ref('menu', 'pick'), id: 'b1' }, expected: ' type="button" data-jxa="menu:pick" id="b1"' },

  // ── values that are not bound intents are refused ───────────────────────────
  { id: 'marker-number-value-is-dropped', src: 'janux', props: { onClick: 5 }, expected: '' },
  { id: 'marker-object-without-intent-metadata-is-dropped', src: 'janux', props: { onClick: { name: 'x' } }, expected: '' },
  { id: 'marker-array-value-is-dropped', src: 'janux', props: { onClick: [1] }, expected: '' },
  { id: 'marker-intent-on-a-non-event-prop-stringifies-inert', src: 'janux', props: { title: ref('menu', 'a') }, expected: ' title="[object Object]"' },
  { id: 'marker-removed-intent-prop-with-a-plain-string-is-dropped', src: 'janux', props: { intent: 'pay' }, expected: '' },

  // ── .with(): the bound input rides data-input ───────────────────────────────
  { id: 'marker-with-empty-input-serializes-empty-json', src: 'janux', props: { onClick: bound(ref('menu', 'pick'), {}) }, expected: ' data-jxa="menu:pick" data-input="{}"' },
  { id: 'marker-with-input-escapes-angle-brackets', src: 'janux', props: { onClick: bound(ref('menu', 'pick'), { html: '<b>' }) }, expected: ' data-jxa="menu:pick" data-input="{&quot;html&quot;:&quot;&lt;b&gt;&quot;}"' },
  { id: 'marker-with-input-array-value', src: 'janux', props: { onKeyDown: bound(ref('sheet', 'sel'), { ids: [1, 2] }) }, expected: ' data-jxe-keydown="sheet:sel" data-input="{&quot;ids&quot;:[1,2]}"' },
  { id: 'marker-with-input-nested-object', src: 'janux', props: { onClick: bound(ref('menu', 'pick'), { pos: { x: 1, y: 2 } }) }, expected: ' data-jxa="menu:pick" data-input="{&quot;pos&quot;:{&quot;x&quot;:1,&quot;y&quot;:2}}"' },
  { id: 'marker-with-input-keeps-unicode', src: 'janux', props: { onClick: bound(ref('menu', 'pick'), { msg: 'olé' }) }, expected: ' data-jxa="menu:pick" data-input="{&quot;msg&quot;:&quot;olé&quot;}"' },
  { id: 'marker-with-input-on-submit', src: 'janux', props: { onSubmit: bound(ref('checkout', 'pay'), { tier: 'pro' }) }, expected: ' data-jxform="checkout:pay" data-input="{&quot;tier&quot;:&quot;pro&quot;}"' },
  { id: 'marker-two-with-bindings-first-input-wins-markers-both-stay', src: 'janux', props: { onClick: bound(ref('menu', 'a'), { p: 1 }), onKeyDown: bound(ref('menu', 'b'), { q: 2 }) }, expected: ' data-jxa="menu:a" data-jxe-keydown="menu:b" data-input="{&quot;p&quot;:1}"' },
  { id: 'marker-explicit-null-data-input-still-suppresses-the-binding', src: 'janux', props: { onClick: bound(ref('menu', 'a'), { p: 1 }), 'data-input': null }, expected: ' data-jxa="menu:a"' },
  // The synthesized data-input is appended after every declared attribute.
  { id: 'marker-with-input-is-appended-last', src: 'janux', props: { onClick: bound(ref('menu', 'a'), { p: 1 }), id: 'x' }, expected: ' data-jxa="menu:a" id="x" data-input="{&quot;p&quot;:1}"' },
];
