import type { IntentRef } from './define/types';

/**
 * Event props for intrinsic elements. Every event binds the same value type: a
 * named intent handed to the view by the runtime. There are no closures by
 * design — a handler must be expressible as a static HTML marker (resumability)
 * and as a named tool with a schema and a guard (the agent surface).
 *
 * The `on${string}` pattern reserves the whole `on*` namespace: any DOM event
 * works (`onWheel`, `onAnimationEnd`, `onCanPlay`, …) even when it is not
 * listed below, and anything on-prefixed that is not an intent is refused at
 * the type level exactly as the renderer refuses it at runtime. The listed
 * props exist for autocomplete and hover docs.
 */
export interface JanuxEventAttributes {
  [onAnyEvent: `on${string}`]: IntentRef | undefined;
  /** Removed — bind the click by name: `onClick={intents.x}`. */
  on?: never;
  /** Removed — bind the submit by name: `onSubmit={intents.x}`. */
  intent?: never;

  // ── mouse ─────────────────────────────────────────────────────────────────
  /** https://developer.mozilla.org/docs/Web/API/Element/click_event */
  onClick?: IntentRef;
  /** `dblclick`. https://developer.mozilla.org/docs/Web/API/Element/dblclick_event */
  onDoubleClick?: IntentRef;
  /** Preact/Brisa spelling of `onDoubleClick`; both land on `dblclick`. */
  onDblClick?: IntentRef;
  /** https://developer.mozilla.org/docs/Web/API/Element/contextmenu_event */
  onContextMenu?: IntentRef;
  /** https://developer.mozilla.org/docs/Web/API/Element/mousedown_event */
  onMouseDown?: IntentRef;
  /** https://developer.mozilla.org/docs/Web/API/Element/mouseup_event */
  onMouseUp?: IntentRef;
  /** Does not bubble; Janux delegates it via the capture phase. https://developer.mozilla.org/docs/Web/API/Element/mouseenter_event */
  onMouseEnter?: IntentRef;
  /** Does not bubble; Janux delegates it via the capture phase. https://developer.mozilla.org/docs/Web/API/Element/mouseleave_event */
  onMouseLeave?: IntentRef;
  /** https://developer.mozilla.org/docs/Web/API/Element/mousemove_event */
  onMouseMove?: IntentRef;
  /** https://developer.mozilla.org/docs/Web/API/Element/mouseover_event */
  onMouseOver?: IntentRef;
  /** https://developer.mozilla.org/docs/Web/API/Element/mouseout_event */
  onMouseOut?: IntentRef;

  // ── pointer ───────────────────────────────────────────────────────────────
  /** https://developer.mozilla.org/docs/Web/API/Element/pointerdown_event */
  onPointerDown?: IntentRef;
  /** https://developer.mozilla.org/docs/Web/API/Element/pointerup_event */
  onPointerUp?: IntentRef;
  /** https://developer.mozilla.org/docs/Web/API/Element/pointermove_event */
  onPointerMove?: IntentRef;
  /** Does not bubble; Janux delegates it via the capture phase. https://developer.mozilla.org/docs/Web/API/Element/pointerenter_event */
  onPointerEnter?: IntentRef;
  /** Does not bubble; Janux delegates it via the capture phase. https://developer.mozilla.org/docs/Web/API/Element/pointerleave_event */
  onPointerLeave?: IntentRef;
  /** https://developer.mozilla.org/docs/Web/API/Element/pointerover_event */
  onPointerOver?: IntentRef;
  /** https://developer.mozilla.org/docs/Web/API/Element/pointerout_event */
  onPointerOut?: IntentRef;
  /** https://developer.mozilla.org/docs/Web/API/Element/pointercancel_event */
  onPointerCancel?: IntentRef;

  // ── keyboard ──────────────────────────────────────────────────────────────
  /** The intent receives `{ key, code, altKey, ctrlKey, metaKey, shiftKey }`. https://developer.mozilla.org/docs/Web/API/Element/keydown_event */
  onKeyDown?: IntentRef;
  /** The intent receives `{ key, code, altKey, ctrlKey, metaKey, shiftKey }`. https://developer.mozilla.org/docs/Web/API/Element/keyup_event */
  onKeyUp?: IntentRef;

  // ── forms and controls ────────────────────────────────────────────────────
  /** On a `<form>`: the intent receives the form's values; add `reset` to empty it after. https://developer.mozilla.org/docs/Web/API/HTMLFormElement/submit_event */
  onSubmit?: IntentRef;
  /** The intent receives `{ value }`; IME composition commits once. https://developer.mozilla.org/docs/Web/API/Element/input_event */
  onInput?: IntentRef;
  /** The intent receives `{ value }`. https://developer.mozilla.org/docs/Web/API/HTMLElement/change_event */
  onChange?: IntentRef;
  /** https://developer.mozilla.org/docs/Web/API/HTMLInputElement/invalid_event */
  onInvalid?: IntentRef;
  /** https://developer.mozilla.org/docs/Web/API/HTMLInputElement/select_event */
  onSelect?: IntentRef;

  // ── focus (delegated via their bubbling variants) ─────────────────────────
  /** Delegates as `focusin`. https://developer.mozilla.org/docs/Web/API/Element/focusin_event */
  onFocus?: IntentRef;
  /** Delegates as `focusout`. https://developer.mozilla.org/docs/Web/API/Element/focusout_event */
  onBlur?: IntentRef;

  // ── clipboard ─────────────────────────────────────────────────────────────
  /** https://developer.mozilla.org/docs/Web/API/Element/copy_event */
  onCopy?: IntentRef;
  /** https://developer.mozilla.org/docs/Web/API/Element/cut_event */
  onCut?: IntentRef;
  /** https://developer.mozilla.org/docs/Web/API/Element/paste_event */
  onPaste?: IntentRef;

  // ── drag and drop ─────────────────────────────────────────────────────────
  /** https://developer.mozilla.org/docs/Web/API/HTMLElement/drag_event */
  onDrag?: IntentRef;
  /** https://developer.mozilla.org/docs/Web/API/HTMLElement/dragstart_event */
  onDragStart?: IntentRef;
  /** https://developer.mozilla.org/docs/Web/API/HTMLElement/dragend_event */
  onDragEnd?: IntentRef;
  /** https://developer.mozilla.org/docs/Web/API/HTMLElement/dragenter_event */
  onDragEnter?: IntentRef;
  /** https://developer.mozilla.org/docs/Web/API/HTMLElement/dragleave_event */
  onDragLeave?: IntentRef;
  /** Rarely needed: binding `onDrop` already enables the zone. https://developer.mozilla.org/docs/Web/API/HTMLElement/dragover_event */
  onDragOver?: IntentRef;
  /**
   * Binding this ENABLES the drop zone: the runtime preventDefaults `dragover`
   * over the marked element for you. Carry the payload in island state via
   * `onDragStart={intents.pick.with(...)}`, not in `dataTransfer`.
   * https://developer.mozilla.org/docs/Web/API/HTMLElement/drop_event
   */
  onDrop?: IntentRef;

  // ── scroll, touch and the rest ────────────────────────────────────────────
  /** https://developer.mozilla.org/docs/Web/API/Element/wheel_event */
  onWheel?: IntentRef;
  /** Does not bubble; Janux delegates it via the capture phase. https://developer.mozilla.org/docs/Web/API/Element/scroll_event */
  onScroll?: IntentRef;
  /** https://developer.mozilla.org/docs/Web/API/Element/touchstart_event */
  onTouchStart?: IntentRef;
  /** https://developer.mozilla.org/docs/Web/API/Element/touchmove_event */
  onTouchMove?: IntentRef;
  /** https://developer.mozilla.org/docs/Web/API/Element/touchend_event */
  onTouchEnd?: IntentRef;
  /** https://developer.mozilla.org/docs/Web/API/Element/touchcancel_event */
  onTouchCancel?: IntentRef;
  /** https://developer.mozilla.org/docs/Web/API/Element/animationstart_event */
  onAnimationStart?: IntentRef;
  /** https://developer.mozilla.org/docs/Web/API/Element/animationend_event */
  onAnimationEnd?: IntentRef;
  /** https://developer.mozilla.org/docs/Web/API/Element/animationiteration_event */
  onAnimationIteration?: IntentRef;
  /** https://developer.mozilla.org/docs/Web/API/Element/transitionend_event */
  onTransitionEnd?: IntentRef;
  /** Does not bubble; Janux delegates it via the capture phase. https://developer.mozilla.org/docs/Web/API/HTMLElement/toggle_event */
  onToggle?: IntentRef;
}

/**
 * The prop surface every intrinsic element accepts: the event family above,
 * the island/form directives, and — until per-tag typing exists — any other
 * attribute.
 */
export interface JanuxElementProps extends JanuxEventAttributes {
  key?: string | number;
  children?: unknown;
  /** `<form onSubmit reset>`: the runtime empties the form once the intent has the values. */
  reset?: boolean;
  /** Extra intent input bound to this control, as a JSON object literal. Wins over event-derived facts. */
  'data-input'?: string;
  [attribute: string]: unknown;
}
