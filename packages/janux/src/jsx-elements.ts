import type { JanuxEventAttributes } from './jsx-events';
import type { JanuxHTMLAttributes } from './jsx-attributes';

/**
 * Per-tag JSX typing: each intrinsic element accepts the global surface
 * (`JanuxHTMLAttributes`), the intent-based events (`JanuxEventAttributes`)
 * and its own element-specific attributes below — nothing else. Attribute
 * names are camelCased where HTML is case-insensitive (`maxLength` renders as
 * a valid `maxlength`); the exceptions that would break are kept native:
 * `for` (never `htmlFor`), `accept-charset`, `http-equiv`.
 *
 * This file is a declaration table — its length is its coverage.
 */
export interface HTMLAttributes extends JanuxHTMLAttributes, JanuxEventAttributes {}

/** How the element handles cross-origin requests. https://developer.mozilla.org/docs/Web/HTML/Attributes/crossorigin */
export type CrossOrigin = '' | 'anonymous' | 'use-credentials';

/** Which referrer to send with fetches the element triggers. https://developer.mozilla.org/docs/Web/HTML/Element/a#referrerpolicy */
export type ReferrerPolicy =
  | 'no-referrer'
  | 'no-referrer-when-downgrade'
  | 'origin'
  | 'origin-when-cross-origin'
  | 'same-origin'
  | 'strict-origin'
  | 'strict-origin-when-cross-origin'
  | 'unsafe-url';

/** Browsing context a link or form targets. https://developer.mozilla.org/docs/Web/HTML/Element/a#target */
export type Target = '_self' | '_blank' | '_parent' | '_top' | (string & {});

export interface AnchorHTMLAttributes extends HTMLAttributes {
  /** URL the hyperlink points to. https://developer.mozilla.org/docs/Web/HTML/Element/a#href */
  href?: string;
  /** Where to display the linked URL. https://developer.mozilla.org/docs/Web/HTML/Element/a#target */
  target?: Target;
  /** Prompts a download; an optional string suggests the filename. https://developer.mozilla.org/docs/Web/HTML/Element/a#download */
  download?: string | boolean;
  /** Relationship of the target object to the link object. https://developer.mozilla.org/docs/Web/HTML/Element/a#rel */
  rel?: string;
  /** Language of the linked URL. https://developer.mozilla.org/docs/Web/HTML/Element/a#hreflang */
  hrefLang?: string;
  /** Space-separated URLs pinged on follow. https://developer.mozilla.org/docs/Web/HTML/Element/a#ping */
  ping?: string;
  /** Referrer to send when fetching the URL. https://developer.mozilla.org/docs/Web/HTML/Element/a#referrerpolicy */
  referrerPolicy?: ReferrerPolicy;
  /** Hints the MIME type of the linked URL. https://developer.mozilla.org/docs/Web/HTML/Element/a#type */
  type?: string;
}

export interface AreaHTMLAttributes extends HTMLAttributes {
  /** Alternative text for the area. https://developer.mozilla.org/docs/Web/HTML/Element/area#alt */
  alt?: string;
  /** Coordinates outlining the hot-spot region. https://developer.mozilla.org/docs/Web/HTML/Element/area#coords */
  coords?: string;
  /** Shape of the hot spot. https://developer.mozilla.org/docs/Web/HTML/Element/area#shape */
  shape?: 'rect' | 'circle' | 'poly' | 'default';
  /** URL the hyperlink points to. https://developer.mozilla.org/docs/Web/HTML/Element/area#href */
  href?: string;
  /** Where to display the linked URL. https://developer.mozilla.org/docs/Web/HTML/Element/area#target */
  target?: Target;
  /** Prompts a download; an optional string suggests the filename. https://developer.mozilla.org/docs/Web/HTML/Element/area#download */
  download?: string | boolean;
  /** Space-separated URLs pinged on follow. https://developer.mozilla.org/docs/Web/HTML/Element/area#ping */
  ping?: string;
  /** Relationship of the target object to the link object. https://developer.mozilla.org/docs/Web/HTML/Element/area#rel */
  rel?: string;
  /** Referrer to send when fetching the URL. https://developer.mozilla.org/docs/Web/HTML/Element/area#referrerpolicy */
  referrerPolicy?: ReferrerPolicy;
}

export interface MediaHTMLAttributes extends HTMLAttributes {
  /** URL of the media resource. https://developer.mozilla.org/docs/Web/HTML/Element/audio#src */
  src?: string;
  /** Starts playback as soon as possible. https://developer.mozilla.org/docs/Web/HTML/Element/audio#autoplay */
  autoplay?: boolean;
  /** Shows the browser's playback controls. https://developer.mozilla.org/docs/Web/HTML/Element/audio#controls */
  controls?: boolean;
  /** Which controls to show when `controls` is set. https://developer.mozilla.org/docs/Web/HTML/Element/audio#controlslist */
  controlsList?: string;
  /** How to handle cross-origin requests. https://developer.mozilla.org/docs/Web/HTML/Element/audio#crossorigin */
  crossOrigin?: CrossOrigin;
  /** Seeks back to the start on end. https://developer.mozilla.org/docs/Web/HTML/Element/audio#loop */
  loop?: boolean;
  /** Mutes the media on load. https://developer.mozilla.org/docs/Web/HTML/Element/audio#muted */
  muted?: boolean;
  /** How much to buffer before playback. https://developer.mozilla.org/docs/Web/HTML/Element/audio#preload */
  preload?: '' | 'none' | 'metadata' | 'auto';
  /** Disables remote-playback (casting) UI. https://developer.mozilla.org/docs/Web/API/HTMLMediaElement/disableRemotePlayback */
  disableRemotePlayback?: boolean;
}

export interface AudioHTMLAttributes extends MediaHTMLAttributes {}

export interface VideoHTMLAttributes extends MediaHTMLAttributes {
  /** Intrinsic width in pixels. https://developer.mozilla.org/docs/Web/HTML/Element/video#width */
  width?: number | string;
  /** Intrinsic height in pixels. https://developer.mozilla.org/docs/Web/HTML/Element/video#height */
  height?: number | string;
  /** Image shown while the video downloads. https://developer.mozilla.org/docs/Web/HTML/Element/video#poster */
  poster?: string;
  /** Plays inline instead of fullscreen on mobile. https://developer.mozilla.org/docs/Web/HTML/Element/video#playsinline */
  playsInline?: boolean;
  /** Disables the picture-in-picture UI. https://developer.mozilla.org/docs/Web/API/HTMLVideoElement/disablePictureInPicture */
  disablePictureInPicture?: boolean;
}

export interface BaseHTMLAttributes extends HTMLAttributes {
  /** Base URL for all relative URLs in the document. https://developer.mozilla.org/docs/Web/HTML/Element/base#href */
  href?: string;
  /** Default browsing context for navigations. https://developer.mozilla.org/docs/Web/HTML/Element/base#target */
  target?: Target;
}

/** `<blockquote>` and `<q>`. */
export interface QuoteHTMLAttributes extends HTMLAttributes {
  /** URL of the source of the quotation. https://developer.mozilla.org/docs/Web/HTML/Element/blockquote#cite */
  cite?: string;
}

/** `<del>` and `<ins>`. */
export interface ModHTMLAttributes extends HTMLAttributes {
  /** URL explaining the change. https://developer.mozilla.org/docs/Web/HTML/Element/del#cite */
  cite?: string;
  /** When the change was made. https://developer.mozilla.org/docs/Web/HTML/Element/del#datetime */
  dateTime?: string;
}

export interface ButtonHTMLAttributes extends HTMLAttributes {
  /** Default behavior of the button. https://developer.mozilla.org/docs/Web/HTML/Element/button#type */
  type?: 'submit' | 'reset' | 'button';
  /** Prevents the user from interacting with the button. https://developer.mozilla.org/docs/Web/HTML/Element/button#disabled */
  disabled?: boolean;
  /** id of the form the button is associated with. https://developer.mozilla.org/docs/Web/HTML/Element/button#form */
  form?: string;
  /** Overrides the form's `action` for this button. https://developer.mozilla.org/docs/Web/HTML/Element/button#formaction */
  formAction?: string;
  /** Overrides the form's `enctype` for this button. https://developer.mozilla.org/docs/Web/HTML/Element/button#formenctype */
  formEncType?: string;
  /** Overrides the form's `method` for this button. https://developer.mozilla.org/docs/Web/HTML/Element/button#formmethod */
  formMethod?: string;
  /** Skips form validation for this button. https://developer.mozilla.org/docs/Web/HTML/Element/button#formnovalidate */
  formNoValidate?: boolean;
  /** Overrides the form's `target` for this button. https://developer.mozilla.org/docs/Web/HTML/Element/button#formtarget */
  formTarget?: Target;
  /** Name submitted with the form data. https://developer.mozilla.org/docs/Web/HTML/Element/button#name */
  name?: string;
  /** Value submitted with the form data. https://developer.mozilla.org/docs/Web/HTML/Element/button#value */
  value?: string | number;
  /** id of the popover element this button controls. https://developer.mozilla.org/docs/Web/HTML/Element/button#popovertarget */
  popoverTarget?: string;
  /** What the button does to its popover target. https://developer.mozilla.org/docs/Web/HTML/Element/button#popovertargetaction */
  popoverTargetAction?: 'show' | 'hide' | 'toggle';
}

export interface CanvasHTMLAttributes extends HTMLAttributes {
  /** Width of the coordinate space in CSS pixels. https://developer.mozilla.org/docs/Web/HTML/Element/canvas#width */
  width?: number | string;
  /** Height of the coordinate space in CSS pixels. https://developer.mozilla.org/docs/Web/HTML/Element/canvas#height */
  height?: number | string;
}

/** `<col>` and `<colgroup>`. */
export interface ColHTMLAttributes extends HTMLAttributes {
  /** Number of consecutive columns the element spans. https://developer.mozilla.org/docs/Web/HTML/Element/col#span */
  span?: number;
}

export interface DataHTMLAttributes extends HTMLAttributes {
  /** Machine-readable translation of the content. https://developer.mozilla.org/docs/Web/HTML/Element/data#value */
  value?: string | number;
}

export interface DetailsHTMLAttributes extends HTMLAttributes {
  /** The details are currently visible. https://developer.mozilla.org/docs/Web/HTML/Element/details#open */
  open?: boolean;
  /** Groups exclusive accordions: only one open per name. https://developer.mozilla.org/docs/Web/HTML/Element/details#name */
  name?: string;
}

export interface DialogHTMLAttributes extends HTMLAttributes {
  /** The dialog is active and interactable. https://developer.mozilla.org/docs/Web/HTML/Element/dialog#open */
  open?: boolean;
}

export interface EmbedHTMLAttributes extends HTMLAttributes {
  /** URL of the resource being embedded. https://developer.mozilla.org/docs/Web/HTML/Element/embed#src */
  src?: string;
  /** MIME type of the embedded content. https://developer.mozilla.org/docs/Web/HTML/Element/embed#type */
  type?: string;
  /** Displayed width in CSS pixels. https://developer.mozilla.org/docs/Web/HTML/Element/embed#width */
  width?: number | string;
  /** Displayed height in CSS pixels. https://developer.mozilla.org/docs/Web/HTML/Element/embed#height */
  height?: number | string;
}

export interface FieldsetHTMLAttributes extends HTMLAttributes {
  /** Disables every form control inside. https://developer.mozilla.org/docs/Web/HTML/Element/fieldset#disabled */
  disabled?: boolean;
  /** id of the form the fieldset belongs to. https://developer.mozilla.org/docs/Web/HTML/Element/fieldset#form */
  form?: string;
  /** Name associated with the group. https://developer.mozilla.org/docs/Web/HTML/Element/fieldset#name */
  name?: string;
}

export interface FormHTMLAttributes extends HTMLAttributes {
  /** URL that processes the form submission. https://developer.mozilla.org/docs/Web/HTML/Element/form#action */
  action?: string;
  /** HTTP method the form submits with. https://developer.mozilla.org/docs/Web/HTML/Element/form#method */
  method?: 'get' | 'post' | 'dialog';
  /** Encoding for `method="post"` submissions. https://developer.mozilla.org/docs/Web/HTML/Element/form#enctype */
  encType?: 'application/x-www-form-urlencoded' | 'multipart/form-data' | 'text/plain';
  /** Character encodings accepted for submission. https://developer.mozilla.org/docs/Web/HTML/Element/form#accept-charset */
  'accept-charset'?: string;
  /** Default autofill behavior of the controls inside. https://developer.mozilla.org/docs/Web/HTML/Element/form#autocomplete */
  autoComplete?: 'on' | 'off';
  /** Skips built-in form validation on submit. https://developer.mozilla.org/docs/Web/HTML/Element/form#novalidate */
  noValidate?: boolean;
  /** Where to display the submission response. https://developer.mozilla.org/docs/Web/HTML/Element/form#target */
  target?: Target;
  /** Relationship of the form's target to the document. https://developer.mozilla.org/docs/Web/HTML/Element/form#rel */
  rel?: string;
  /** Name of the form, unique among forms. https://developer.mozilla.org/docs/Web/HTML/Element/form#name */
  name?: string;
}

export interface HtmlHTMLAttributes extends HTMLAttributes {
  /** RDFa prefix mappings for the document. https://developer.mozilla.org/docs/Web/HTML/Global_attributes */
  prefix?: string;
}

export interface IframeHTMLAttributes extends HTMLAttributes {
  /** URL of the page to embed. https://developer.mozilla.org/docs/Web/HTML/Element/iframe#src */
  src?: string;
  /** Inline HTML to embed, overriding `src`. https://developer.mozilla.org/docs/Web/HTML/Element/iframe#srcdoc */
  srcDoc?: string;
  /** Name for targeting the embedded browsing context. https://developer.mozilla.org/docs/Web/HTML/Element/iframe#name */
  name?: string;
  /** Extra restrictions for the content of the frame. https://developer.mozilla.org/docs/Web/HTML/Element/iframe#sandbox */
  sandbox?: string;
  /** Permissions-Policy for the frame. https://developer.mozilla.org/docs/Web/HTML/Element/iframe#allow */
  allow?: string;
  /** Legacy switch to allow fullscreen; prefer `allow="fullscreen"`. https://developer.mozilla.org/docs/Web/HTML/Element/iframe#allowfullscreen */
  allowFullScreen?: boolean;
  /** Frame width in CSS pixels. https://developer.mozilla.org/docs/Web/HTML/Element/iframe#width */
  width?: number | string;
  /** Frame height in CSS pixels. https://developer.mozilla.org/docs/Web/HTML/Element/iframe#height */
  height?: number | string;
  /** Defers loading until the frame nears the viewport. https://developer.mozilla.org/docs/Web/HTML/Element/iframe#loading */
  loading?: 'eager' | 'lazy';
  /** Referrer to send when fetching the frame's resource. https://developer.mozilla.org/docs/Web/HTML/Element/iframe#referrerpolicy */
  referrerPolicy?: ReferrerPolicy;
}

export interface ImgHTMLAttributes extends HTMLAttributes {
  /** URL of the image. https://developer.mozilla.org/docs/Web/HTML/Element/img#src */
  src?: string;
  /** Candidate images for responsive selection. https://developer.mozilla.org/docs/Web/HTML/Element/img#srcset */
  srcSet?: string;
  /** Layout widths that pick from `srcSet`. https://developer.mozilla.org/docs/Web/HTML/Element/img#sizes */
  sizes?: string;
  /** Text alternative when the image can't be shown. https://developer.mozilla.org/docs/Web/HTML/Element/img#alt */
  alt?: string;
  /** Intrinsic width in pixels. https://developer.mozilla.org/docs/Web/HTML/Element/img#width */
  width?: number | string;
  /** Intrinsic height in pixels. https://developer.mozilla.org/docs/Web/HTML/Element/img#height */
  height?: number | string;
  /** Defers loading until the image nears the viewport. https://developer.mozilla.org/docs/Web/HTML/Element/img#loading */
  loading?: 'eager' | 'lazy';
  /** Decoding hint: off the main thread (`async`) or synchronously. https://developer.mozilla.org/docs/Web/HTML/Element/img#decoding */
  decoding?: 'sync' | 'async' | 'auto';
  /** Relative priority for fetching this image. https://developer.mozilla.org/docs/Web/HTML/Element/img#fetchpriority */
  fetchPriority?: 'high' | 'low' | 'auto';
  /** How to handle cross-origin requests. https://developer.mozilla.org/docs/Web/HTML/Element/img#crossorigin */
  crossOrigin?: CrossOrigin;
  /** Referrer to send when fetching the image. https://developer.mozilla.org/docs/Web/HTML/Element/img#referrerpolicy */
  referrerPolicy?: ReferrerPolicy;
  /** Image map to use, as `#` + map name. https://developer.mozilla.org/docs/Web/HTML/Element/img#usemap */
  useMap?: string;
  /** Marks the image for the Element Timing API. https://developer.mozilla.org/docs/Web/API/PerformanceElementTiming */
  elementTiming?: string;
}

export interface InputHTMLAttributes extends HTMLAttributes {
  /** Kind of control to display. https://developer.mozilla.org/docs/Web/HTML/Element/input#type */
  type?:
    | 'button'
    | 'checkbox'
    | 'color'
    | 'date'
    | 'datetime-local'
    | 'email'
    | 'file'
    | 'hidden'
    | 'image'
    | 'month'
    | 'number'
    | 'password'
    | 'radio'
    | 'range'
    | 'reset'
    | 'search'
    | 'submit'
    | 'tel'
    | 'text'
    | 'time'
    | 'url'
    | 'week';
  /** Current value of the control. https://developer.mozilla.org/docs/Web/HTML/Element/input#value */
  value?: string | number;
  /** The checkbox or radio is selected. https://developer.mozilla.org/docs/Web/HTML/Element/input#checked */
  checked?: boolean;
  /** File types accepted by a `file` input. https://developer.mozilla.org/docs/Web/HTML/Element/input#accept */
  accept?: string;
  /** Text alternative for an `image` input. https://developer.mozilla.org/docs/Web/HTML/Element/input#alt */
  alt?: string;
  /** Autofill hint for the control. https://developer.mozilla.org/docs/Web/HTML/Element/input#autocomplete */
  autoComplete?: string;
  /** Which camera/mic captures for a `file` input. https://developer.mozilla.org/docs/Web/HTML/Element/input#capture */
  capture?: boolean | 'user' | 'environment';
  /** Prevents the user from interacting with the control. https://developer.mozilla.org/docs/Web/HTML/Element/input#disabled */
  disabled?: boolean;
  /** id of the form the control is associated with. https://developer.mozilla.org/docs/Web/HTML/Element/input#form */
  form?: string;
  /** Overrides the form's `action` for `submit`/`image` inputs. https://developer.mozilla.org/docs/Web/HTML/Element/input#formaction */
  formAction?: string;
  /** Overrides the form's `enctype` for `submit`/`image` inputs. https://developer.mozilla.org/docs/Web/HTML/Element/input#formenctype */
  formEncType?: string;
  /** Overrides the form's `method` for `submit`/`image` inputs. https://developer.mozilla.org/docs/Web/HTML/Element/input#formmethod */
  formMethod?: string;
  /** Skips form validation for `submit`/`image` inputs. https://developer.mozilla.org/docs/Web/HTML/Element/input#formnovalidate */
  formNoValidate?: boolean;
  /** Overrides the form's `target` for `submit`/`image` inputs. https://developer.mozilla.org/docs/Web/HTML/Element/input#formtarget */
  formTarget?: Target;
  /** Width of an `image` input in CSS pixels. https://developer.mozilla.org/docs/Web/HTML/Element/input#width */
  width?: number | string;
  /** Height of an `image` input in CSS pixels. https://developer.mozilla.org/docs/Web/HTML/Element/input#height */
  height?: number | string;
  /** URL of the image for an `image` input. https://developer.mozilla.org/docs/Web/HTML/Element/input#src */
  src?: string;
  /** id of a `<datalist>` with suggested values. https://developer.mozilla.org/docs/Web/HTML/Element/input#list */
  list?: string;
  /** Maximum accepted value. https://developer.mozilla.org/docs/Web/HTML/Element/input#max */
  max?: number | string;
  /** Maximum number of characters. https://developer.mozilla.org/docs/Web/HTML/Element/input#maxlength */
  maxLength?: number;
  /** Minimum accepted value. https://developer.mozilla.org/docs/Web/HTML/Element/input#min */
  min?: number | string;
  /** Minimum number of characters. https://developer.mozilla.org/docs/Web/HTML/Element/input#minlength */
  minLength?: number;
  /** A `file`/`email` input accepts several values. https://developer.mozilla.org/docs/Web/HTML/Element/input#multiple */
  multiple?: boolean;
  /** Name submitted with the form data. https://developer.mozilla.org/docs/Web/HTML/Element/input#name */
  name?: string;
  /** Regular expression the value must match. https://developer.mozilla.org/docs/Web/HTML/Element/input#pattern */
  pattern?: string;
  /** Hint shown while the control is empty. https://developer.mozilla.org/docs/Web/HTML/Element/input#placeholder */
  placeholder?: string;
  /** The value cannot be edited. https://developer.mozilla.org/docs/Web/HTML/Element/input#readonly */
  readOnly?: boolean;
  /** A value is required to submit the form. https://developer.mozilla.org/docs/Web/HTML/Element/input#required */
  required?: boolean;
  /** Visible size of the control, in characters. https://developer.mozilla.org/docs/Web/HTML/Element/input#size */
  size?: number;
  /** Granularity of numeric/date values. https://developer.mozilla.org/docs/Web/HTML/Element/input#step */
  step?: number | string;
  /** Safari: renders a checkbox as a switch. https://developer.mozilla.org/docs/Web/HTML/Element/input/checkbox#switch */
  switch?: boolean;
  /** id of the popover element this control toggles. https://developer.mozilla.org/docs/Web/HTML/Element/input#popovertarget */
  popoverTarget?: string;
  /** What the control does to its popover target. https://developer.mozilla.org/docs/Web/HTML/Element/input#popovertargetaction */
  popoverTargetAction?: 'show' | 'hide' | 'toggle';
}

export interface LabelHTMLAttributes extends HTMLAttributes {
  /** id of the form control the label is bound to. https://developer.mozilla.org/docs/Web/HTML/Element/label#for */
  for?: string;
}

export interface LiHTMLAttributes extends HTMLAttributes {
  /** Ordinal of the item in an ordered list. https://developer.mozilla.org/docs/Web/HTML/Element/li#value */
  value?: number | string;
}

export interface LinkHTMLAttributes extends HTMLAttributes {
  /** URL of the linked resource. https://developer.mozilla.org/docs/Web/HTML/Element/link#href */
  href?: string;
  /** Relationship of the linked resource to the document. https://developer.mozilla.org/docs/Web/HTML/Element/link#rel */
  rel?: string;
  /** Type of content loaded with `rel="preload"`/`"modulepreload"`. https://developer.mozilla.org/docs/Web/HTML/Element/link#as */
  as?: string;
  /** How to handle cross-origin requests. https://developer.mozilla.org/docs/Web/HTML/Element/link#crossorigin */
  crossOrigin?: CrossOrigin;
  /** Subresource-integrity hash the resource must match. https://developer.mozilla.org/docs/Web/HTML/Element/link#integrity */
  integrity?: string;
  /** Media the resource applies to. https://developer.mozilla.org/docs/Web/HTML/Element/link#media */
  media?: string;
  /** Relative priority for fetching this resource. https://developer.mozilla.org/docs/Web/HTML/Element/link#fetchpriority */
  fetchPriority?: 'high' | 'low' | 'auto';
  /** Referrer to send when fetching the resource. https://developer.mozilla.org/docs/Web/HTML/Element/link#referrerpolicy */
  referrerPolicy?: ReferrerPolicy;
  /** Icon sizes for `rel="icon"`. https://developer.mozilla.org/docs/Web/HTML/Element/link#sizes */
  sizes?: string;
  /** MIME type of the linked resource. https://developer.mozilla.org/docs/Web/HTML/Element/link#type */
  type?: string;
  /** Language of the linked resource. https://developer.mozilla.org/docs/Web/HTML/Element/link#hreflang */
  hrefLang?: string;
  /** Candidate images for a preloaded responsive image. https://developer.mozilla.org/docs/Web/HTML/Element/link#imagesrcset */
  imageSrcSet?: string;
  /** Layout widths for a preloaded responsive image. https://developer.mozilla.org/docs/Web/HTML/Element/link#imagesizes */
  imageSizes?: string;
}

export interface MapHTMLAttributes extends HTMLAttributes {
  /** Name referenced by an `<img useMap>`. https://developer.mozilla.org/docs/Web/HTML/Element/map#name */
  name?: string;
}

export interface MetaHTMLAttributes extends HTMLAttributes {
  /** Metadata name (`description`, `viewport`, …). https://developer.mozilla.org/docs/Web/HTML/Element/meta#name */
  name?: string;
  /** Value for `name`, `http-equiv` or `property`. https://developer.mozilla.org/docs/Web/HTML/Element/meta#content */
  content?: string;
  /** Declares the document's character encoding. https://developer.mozilla.org/docs/Web/HTML/Element/meta#charset */
  charSet?: string;
  /** Pragma directive (e.g. `refresh`). https://developer.mozilla.org/docs/Web/HTML/Element/meta#http-equiv */
  'http-equiv'?: string;
  /** Media query for `name="theme-color"`. https://developer.mozilla.org/docs/Web/HTML/Element/meta#media */
  media?: string;
  /** RDFa/Open-Graph property name (`og:title`, …). https://ogp.me */
  property?: string;
}

export interface MeterHTMLAttributes extends HTMLAttributes {
  /** Current numeric value. https://developer.mozilla.org/docs/Web/HTML/Element/meter#value */
  value?: number | string;
  /** Lower bound of the range. https://developer.mozilla.org/docs/Web/HTML/Element/meter#min */
  min?: number | string;
  /** Upper bound of the range. https://developer.mozilla.org/docs/Web/HTML/Element/meter#max */
  max?: number | string;
  /** Upper bound of the "low" segment. https://developer.mozilla.org/docs/Web/HTML/Element/meter#low */
  low?: number;
  /** Lower bound of the "high" segment. https://developer.mozilla.org/docs/Web/HTML/Element/meter#high */
  high?: number;
  /** Optimal value within the range. https://developer.mozilla.org/docs/Web/HTML/Element/meter#optimum */
  optimum?: number;
  /** id of the form the meter is associated with. https://developer.mozilla.org/docs/Web/HTML/Element/meter#form */
  form?: string;
}

export interface ObjectHTMLAttributes extends HTMLAttributes {
  /** URL of the embedded resource. https://developer.mozilla.org/docs/Web/HTML/Element/object#data */
  data?: string;
  /** MIME type of the embedded resource. https://developer.mozilla.org/docs/Web/HTML/Element/object#type */
  type?: string;
  /** Name of the browsing context or control. https://developer.mozilla.org/docs/Web/HTML/Element/object#name */
  name?: string;
  /** id of the form the object is associated with. https://developer.mozilla.org/docs/Web/HTML/Element/object#form */
  form?: string;
  /** Displayed width in CSS pixels. https://developer.mozilla.org/docs/Web/HTML/Element/object#width */
  width?: number | string;
  /** Displayed height in CSS pixels. https://developer.mozilla.org/docs/Web/HTML/Element/object#height */
  height?: number | string;
  /** Image map to use, as `#` + map name. https://developer.mozilla.org/docs/Web/HTML/Element/object#usemap */
  useMap?: string;
}

export interface OlHTMLAttributes extends HTMLAttributes {
  /** Numbers the items in descending order. https://developer.mozilla.org/docs/Web/HTML/Element/ol#reversed */
  reversed?: boolean;
  /** Ordinal of the first item. https://developer.mozilla.org/docs/Web/HTML/Element/ol#start */
  start?: number;
  /** Numbering style (`1`, `a`, `A`, `i`, `I`). https://developer.mozilla.org/docs/Web/HTML/Element/ol#type */
  type?: '1' | 'a' | 'A' | 'i' | 'I';
}

export interface OptgroupHTMLAttributes extends HTMLAttributes {
  /** Prevents selecting any option in the group. https://developer.mozilla.org/docs/Web/HTML/Element/optgroup#disabled */
  disabled?: boolean;
  /** Name of the group shown to the user. https://developer.mozilla.org/docs/Web/HTML/Element/optgroup#label */
  label?: string;
}

export interface OptionHTMLAttributes extends HTMLAttributes {
  /** The option cannot be selected. https://developer.mozilla.org/docs/Web/HTML/Element/option#disabled */
  disabled?: boolean;
  /** Label shown instead of the text content. https://developer.mozilla.org/docs/Web/HTML/Element/option#label */
  label?: string;
  /** The option is initially selected. https://developer.mozilla.org/docs/Web/HTML/Element/option#selected */
  selected?: boolean;
  /** Value submitted with the form data. https://developer.mozilla.org/docs/Web/HTML/Element/option#value */
  value?: string | number;
}

export interface OutputHTMLAttributes extends HTMLAttributes {
  /** id list of the elements that contributed to the result. https://developer.mozilla.org/docs/Web/HTML/Element/output#for */
  for?: string;
  /** id of the form the output is associated with. https://developer.mozilla.org/docs/Web/HTML/Element/output#form */
  form?: string;
  /** Name submitted with the form data. https://developer.mozilla.org/docs/Web/HTML/Element/output#name */
  name?: string;
}

export interface ProgressHTMLAttributes extends HTMLAttributes {
  /** How much of the task is complete. https://developer.mozilla.org/docs/Web/HTML/Element/progress#value */
  value?: number | string;
  /** Total amount of work of the task. https://developer.mozilla.org/docs/Web/HTML/Element/progress#max */
  max?: number | string;
}

export interface ScriptHTMLAttributes extends HTMLAttributes {
  /** URL of an external script. https://developer.mozilla.org/docs/Web/HTML/Element/script#src */
  src?: string;
  /** Script type: `module`, `importmap` or a MIME type. https://developer.mozilla.org/docs/Web/HTML/Element/script#type */
  type?: string;
  /** Fetches in parallel and runs as soon as available. https://developer.mozilla.org/docs/Web/HTML/Element/script#async */
  async?: boolean;
  /** Fetches in parallel and runs after the document parses. https://developer.mozilla.org/docs/Web/HTML/Element/script#defer */
  defer?: boolean;
  /** How to handle cross-origin requests. https://developer.mozilla.org/docs/Web/HTML/Element/script#crossorigin */
  crossOrigin?: CrossOrigin;
  /** Subresource-integrity hash the script must match. https://developer.mozilla.org/docs/Web/HTML/Element/script#integrity */
  integrity?: string;
  /** Skips the script in module-supporting browsers. https://developer.mozilla.org/docs/Web/HTML/Element/script#nomodule */
  noModule?: boolean;
  /** Relative priority for fetching this script. https://developer.mozilla.org/docs/Web/HTML/Element/script#fetchpriority */
  fetchPriority?: 'high' | 'low' | 'auto';
  /** Referrer to send when fetching the script. https://developer.mozilla.org/docs/Web/HTML/Element/script#referrerpolicy */
  referrerPolicy?: ReferrerPolicy;
}

export interface SelectHTMLAttributes extends HTMLAttributes {
  /** Autofill hint for the control. https://developer.mozilla.org/docs/Web/HTML/Element/select#autocomplete */
  autoComplete?: string;
  /** Prevents the user from interacting with the control. https://developer.mozilla.org/docs/Web/HTML/Element/select#disabled */
  disabled?: boolean;
  /** id of the form the control is associated with. https://developer.mozilla.org/docs/Web/HTML/Element/select#form */
  form?: string;
  /** Multiple options can be selected. https://developer.mozilla.org/docs/Web/HTML/Element/select#multiple */
  multiple?: boolean;
  /** Name submitted with the form data. https://developer.mozilla.org/docs/Web/HTML/Element/select#name */
  name?: string;
  /** An option must be selected to submit the form. https://developer.mozilla.org/docs/Web/HTML/Element/select#required */
  required?: boolean;
  /** Number of rows shown for a scrolling list box. https://developer.mozilla.org/docs/Web/HTML/Element/select#size */
  size?: number;
  /** Value of the selected option(s). https://developer.mozilla.org/docs/Web/HTML/Element/select#value */
  value?: string | string[] | number;
}

export interface SlotHTMLAttributes extends HTMLAttributes {
  /** Name of the slot light-DOM children target. https://developer.mozilla.org/docs/Web/HTML/Element/slot#name */
  name?: string;
}

export interface SourceHTMLAttributes extends HTMLAttributes {
  /** URL of the media resource. https://developer.mozilla.org/docs/Web/HTML/Element/source#src */
  src?: string;
  /** Candidate images for responsive selection. https://developer.mozilla.org/docs/Web/HTML/Element/source#srcset */
  srcSet?: string;
  /** Layout widths that pick from `srcSet`. https://developer.mozilla.org/docs/Web/HTML/Element/source#sizes */
  sizes?: string;
  /** Media query the source applies to. https://developer.mozilla.org/docs/Web/HTML/Element/source#media */
  media?: string;
  /** MIME type of the resource. https://developer.mozilla.org/docs/Web/HTML/Element/source#type */
  type?: string;
  /** Intrinsic width of the image source. https://developer.mozilla.org/docs/Web/HTML/Element/source#width */
  width?: number | string;
  /** Intrinsic height of the image source. https://developer.mozilla.org/docs/Web/HTML/Element/source#height */
  height?: number | string;
}

export interface StyleHTMLAttributes extends HTMLAttributes {
  /** Media the styles apply to. https://developer.mozilla.org/docs/Web/HTML/Element/style#media */
  media?: string;
  /** Blocks rendering until the stylesheet loads. https://developer.mozilla.org/docs/Web/HTML/Element/style#blocking */
  blocking?: 'render';
}

export interface TdHTMLAttributes extends HTMLAttributes {
  /** Number of columns the cell spans. https://developer.mozilla.org/docs/Web/HTML/Element/td#colspan */
  colSpan?: number;
  /** Number of rows the cell spans. https://developer.mozilla.org/docs/Web/HTML/Element/td#rowspan */
  rowSpan?: number;
  /** id list of the header cells for this cell. https://developer.mozilla.org/docs/Web/HTML/Element/td#headers */
  headers?: string;
}

export interface ThHTMLAttributes extends TdHTMLAttributes {
  /** Cells the header relates to. https://developer.mozilla.org/docs/Web/HTML/Element/th#scope */
  scope?: 'row' | 'col' | 'rowgroup' | 'colgroup';
  /** Short abbreviated description of the header. https://developer.mozilla.org/docs/Web/HTML/Element/th#abbr */
  abbr?: string;
}

export interface TemplateHTMLAttributes extends HTMLAttributes {
  /** Turns the template into a declarative shadow root. https://developer.mozilla.org/docs/Web/HTML/Element/template#shadowrootmode */
  shadowrootmode?: 'open' | 'closed';
  /** The declarative shadow root delegates focus. https://developer.mozilla.org/docs/Web/HTML/Element/template#shadowrootdelegatesfocus */
  shadowrootdelegatesfocus?: boolean;
}

export interface TextareaHTMLAttributes extends HTMLAttributes {
  /** Autofill hint for the control. https://developer.mozilla.org/docs/Web/HTML/Element/textarea#autocomplete */
  autoComplete?: string;
  /** Visible width, in average character widths. https://developer.mozilla.org/docs/Web/HTML/Element/textarea#cols */
  cols?: number;
  /** Visible number of text lines. https://developer.mozilla.org/docs/Web/HTML/Element/textarea#rows */
  rows?: number;
  /** Prevents the user from interacting with the control. https://developer.mozilla.org/docs/Web/HTML/Element/textarea#disabled */
  disabled?: boolean;
  /** id of the form the control is associated with. https://developer.mozilla.org/docs/Web/HTML/Element/textarea#form */
  form?: string;
  /** Maximum number of characters. https://developer.mozilla.org/docs/Web/HTML/Element/textarea#maxlength */
  maxLength?: number;
  /** Minimum number of characters. https://developer.mozilla.org/docs/Web/HTML/Element/textarea#minlength */
  minLength?: number;
  /** Name submitted with the form data. https://developer.mozilla.org/docs/Web/HTML/Element/textarea#name */
  name?: string;
  /** Hint shown while the control is empty. https://developer.mozilla.org/docs/Web/HTML/Element/textarea#placeholder */
  placeholder?: string;
  /** The value cannot be edited. https://developer.mozilla.org/docs/Web/HTML/Element/textarea#readonly */
  readOnly?: boolean;
  /** A value is required to submit the form. https://developer.mozilla.org/docs/Web/HTML/Element/textarea#required */
  required?: boolean;
  /** How line breaks are submitted. https://developer.mozilla.org/docs/Web/HTML/Element/textarea#wrap */
  wrap?: 'hard' | 'soft' | 'off';
  /** Initial value of the control. https://developer.mozilla.org/docs/Web/HTML/Element/textarea */
  value?: string | number;
}

export interface TimeHTMLAttributes extends HTMLAttributes {
  /** Machine-readable form of the date/time. https://developer.mozilla.org/docs/Web/HTML/Element/time#datetime */
  dateTime?: string;
}

export interface TrackHTMLAttributes extends HTMLAttributes {
  /** Enables the track unless another fits better. https://developer.mozilla.org/docs/Web/HTML/Element/track#default */
  default?: boolean;
  /** How the text track is meant to be used. https://developer.mozilla.org/docs/Web/HTML/Element/track#kind */
  kind?: 'subtitles' | 'captions' | 'descriptions' | 'chapters' | 'metadata';
  /** User-visible title of the track. https://developer.mozilla.org/docs/Web/HTML/Element/track#label */
  label?: string;
  /** URL of the track (`.vtt`). https://developer.mozilla.org/docs/Web/HTML/Element/track#src */
  src?: string;
  /** Language of the track text. https://developer.mozilla.org/docs/Web/HTML/Element/track#srclang */
  srcLang?: string;
}

/**
 * The SVG attribute surface. Janux emits attribute names verbatim, and SVG is
 * case-sensitive: presentation attributes keep their kebab-case names
 * (`stroke-width`, never `strokeWidth`), while genuinely camelCased SVG names
 * (`viewBox`, `attributeName`, …) keep their casing. Both spellings serialize
 * correctly on the server and through `setAttribute` on the client.
 */
export interface SVGAttributes extends HTMLAttributes {
  // ── geometry and structure ────────────────────────────────────────────────
  /** Position/size of the viewport the SVG content maps into. https://developer.mozilla.org/docs/Web/SVG/Attribute/viewBox */
  viewBox?: string;
  /** How the SVG scales into a viewport with a different aspect ratio. https://developer.mozilla.org/docs/Web/SVG/Attribute/preserveAspectRatio */
  preserveAspectRatio?: string;
  /** XML namespace; needed when the SVG is a standalone document. */
  xmlns?: string;
  /** xlink namespace declaration for legacy consumers. */
  'xmlns:xlink'?: string;
  /** Path data of a `<path>`. https://developer.mozilla.org/docs/Web/SVG/Attribute/d */
  d?: string;
  /** Point list of a `<polygon>`/`<polyline>`. https://developer.mozilla.org/docs/Web/SVG/Attribute/points */
  points?: string;
  /** Transform list applied to the element. https://developer.mozilla.org/docs/Web/SVG/Attribute/transform */
  transform?: string;
  /** URL of the resource a `<use>`/`<image>` references. https://developer.mozilla.org/docs/Web/SVG/Attribute/href */
  href?: string;
  /** Total length the browser should assume for the path. */
  pathLength?: number | string;
  x?: number | string;
  y?: number | string;
  x1?: number | string;
  y1?: number | string;
  x2?: number | string;
  y2?: number | string;
  /** Center x of a circle/ellipse or focal shape. */
  cx?: number | string;
  /** Center y of a circle/ellipse or focal shape. */
  cy?: number | string;
  /** Radius of a `<circle>`. */
  r?: number | string;
  /** Horizontal radius of an `<ellipse>` or rounded `<rect>`. */
  rx?: number | string;
  /** Vertical radius of an `<ellipse>` or rounded `<rect>`. */
  ry?: number | string;
  /** Focal x of a radial gradient. */
  fx?: number | string;
  /** Focal y of a radial gradient. */
  fy?: number | string;
  width?: number | string;
  height?: number | string;
  dx?: number | string;
  dy?: number | string;
  rotate?: number | string;
  offset?: number | string;

  // ── paint (kebab-case: SVG is case-sensitive and Janux emits names verbatim)
  /** Paint of the interior. https://developer.mozilla.org/docs/Web/SVG/Attribute/fill */
  fill?: string;
  'fill-opacity'?: number | string;
  'fill-rule'?: 'nonzero' | 'evenodd' | 'inherit';
  /** Paint of the outline. https://developer.mozilla.org/docs/Web/SVG/Attribute/stroke */
  stroke?: string;
  'stroke-dasharray'?: string | number;
  'stroke-dashoffset'?: string | number;
  'stroke-linecap'?: 'butt' | 'round' | 'square' | 'inherit';
  'stroke-linejoin'?: 'miter' | 'round' | 'bevel' | 'inherit';
  'stroke-miterlimit'?: string | number;
  'stroke-opacity'?: number | string;
  'stroke-width'?: number | string;
  opacity?: number | string;
  'alignment-baseline'?: 'auto' | 'baseline' | 'before-edge' | 'text-before-edge' | 'middle' | 'central' | 'after-edge' | 'text-after-edge' | 'ideographic' | 'alphabetic' | 'hanging' | 'mathematical' | 'inherit';
  'baseline-shift'?: number | string;
  'clip-path'?: string;
  'clip-rule'?: number | string;
  'color-interpolation'?: number | string;
  'color-interpolation-filters'?: 'auto' | 'sRGB' | 'linearRGB' | 'inherit';
  'dominant-baseline'?: number | string;
  'flood-color'?: number | string;
  'flood-opacity'?: number | string;
  'font-family'?: string;
  'font-size'?: number | string;
  'font-size-adjust'?: number | string;
  'font-stretch'?: number | string;
  'font-style'?: number | string;
  'font-variant'?: number | string;
  'font-weight'?: number | string;
  'image-rendering'?: number | string;
  'letter-spacing'?: number | string;
  'lighting-color'?: number | string;
  'marker-end'?: string;
  'marker-mid'?: string;
  'marker-start'?: string;
  'overline-position'?: number | string;
  'overline-thickness'?: number | string;
  'paint-order'?: number | string;
  'pointer-events'?: number | string;
  'shape-rendering'?: number | string;
  'stop-color'?: string;
  'stop-opacity'?: number | string;
  'strikethrough-position'?: number | string;
  'strikethrough-thickness'?: number | string;
  'text-anchor'?: string;
  'text-decoration'?: number | string;
  'text-rendering'?: number | string;
  'underline-position'?: number | string;
  'underline-thickness'?: number | string;
  'unicode-bidi'?: number | string;
  'vector-effect'?: number | string;
  'word-spacing'?: number | string;
  'writing-mode'?: number | string;
  clip?: number | string;
  cursor?: number | string;
  direction?: number | string;
  display?: number | string;
  filter?: string;
  mask?: string;
  overflow?: number | string;
  visibility?: number | string;

  // ── gradients, patterns, markers, masks ───────────────────────────────────
  gradientTransform?: string;
  gradientUnits?: 'userSpaceOnUse' | 'objectBoundingBox';
  spreadMethod?: 'pad' | 'reflect' | 'repeat';
  patternContentUnits?: string;
  patternTransform?: number | string;
  patternUnits?: string;
  markerHeight?: number | string;
  markerUnits?: number | string;
  markerWidth?: number | string;
  refX?: number | string;
  refY?: number | string;
  orient?: number | string;
  maskContentUnits?: number | string;
  maskUnits?: number | string;
  clipPathUnits?: number | string;

  // ── text layout ───────────────────────────────────────────────────────────
  lengthAdjust?: 'spacing' | 'spacingAndGlyphs';
  textLength?: number | string;
  startOffset?: number | string;
  spacing?: 'auto' | 'exact';

  // ── filter primitives ─────────────────────────────────────────────────────
  filterUnits?: number | string;
  primitiveUnits?: number | string;
  /** Input of the filter primitive. https://developer.mozilla.org/docs/Web/SVG/Attribute/in */
  in?: string;
  in2?: number | string;
  result?: string;
  mode?: number | string;
  operator?: number | string;
  radius?: number | string;
  scale?: number | string;
  baseFrequency?: number | string;
  numOctaves?: number | string;
  seed?: number | string;
  stitchTiles?: 'stitch' | 'noStitch';
  stdDeviation?: number | string;
  edgeMode?: number | string;
  kernelMatrix?: number | string;
  order?: number | string;
  divisor?: number | string;
  bias?: number | string;
  targetX?: number | string;
  targetY?: number | string;
  preserveAlpha?: number | string;
  xChannelSelector?: 'R' | 'G' | 'B' | 'A';
  yChannelSelector?: 'R' | 'G' | 'B' | 'A';
  surfaceScale?: number | string;
  diffuseConstant?: number | string;
  specularConstant?: number | string;
  specularExponent?: number | string;
  limitingConeAngle?: number | string;
  azimuth?: number | string;
  elevation?: number | string;
  pointsAtX?: number | string;
  pointsAtY?: number | string;
  pointsAtZ?: number | string;
  z?: number | string;
  k1?: number | string;
  k2?: number | string;
  k3?: number | string;
  k4?: number | string;
  tableValues?: number | string;
  intercept?: number | string;
  exponent?: number | string;
  amplitude?: number | string;

  // ── animation ─────────────────────────────────────────────────────────────
  attributeName?: string;
  attributeType?: string;
  accumulate?: 'none' | 'sum';
  additive?: 'replace' | 'sum';
  begin?: number | string;
  end?: number | string;
  dur?: number | string;
  calcMode?: 'discrete' | 'linear' | 'paced' | 'spline';
  keyPoints?: number | string;
  keySplines?: number | string;
  keyTimes?: number | string;
  from?: number | string;
  to?: number | string;
  by?: number | string;
  values?: string;
  repeatCount?: number | string;
  repeatDur?: number | string;
  restart?: 'always' | 'whenNotActive' | 'never';
  origin?: number | string;
  systemLanguage?: number | string;
}

/**
 * Every SVG tag Janux renders. `<a>`, `<script>`, `<style>` and `<title>`
 * keep their HTML typing, which SVG accepts too.
 */
export interface JanuxSVGElements {
  /** Container defining a new SVG coordinate system and viewport. https://developer.mozilla.org/docs/Web/SVG/Element/svg */
  svg: SVGAttributes;
  /** Animates an attribute of the parent element over time. https://developer.mozilla.org/docs/Web/SVG/Element/animate */
  animate: SVGAttributes;
  /** Moves the parent element along a motion path. https://developer.mozilla.org/docs/Web/SVG/Element/animateMotion */
  animateMotion: SVGAttributes;
  /** Animates a transform attribute of the parent. https://developer.mozilla.org/docs/Web/SVG/Element/animateTransform */
  animateTransform: SVGAttributes;
  /** Circle from a center point and a radius. https://developer.mozilla.org/docs/Web/SVG/Element/circle */
  circle: SVGAttributes;
  /** Clipping path referenced via `clip-path`. https://developer.mozilla.org/docs/Web/SVG/Element/clipPath */
  clipPath: SVGAttributes;
  /** Referenced elements that render only when used. https://developer.mozilla.org/docs/Web/SVG/Element/defs */
  defs: SVGAttributes;
  /** Accessible description of its parent. https://developer.mozilla.org/docs/Web/SVG/Element/desc */
  desc: SVGAttributes;
  /** Ellipse from a center point and two radii. https://developer.mozilla.org/docs/Web/SVG/Element/ellipse */
  ellipse: SVGAttributes;
  /** Blends two input images. https://developer.mozilla.org/docs/Web/SVG/Element/feBlend */
  feBlend: SVGAttributes;
  /** Matrix transform on pixel colors. https://developer.mozilla.org/docs/Web/SVG/Element/feColorMatrix */
  feColorMatrix: SVGAttributes;
  /** Per-channel transfer functions. https://developer.mozilla.org/docs/Web/SVG/Element/feComponentTransfer */
  feComponentTransfer: SVGAttributes;
  /** Composites two images with Porter-Duff operators. https://developer.mozilla.org/docs/Web/SVG/Element/feComposite */
  feComposite: SVGAttributes;
  /** Convolution: pixels combined with their neighbors. https://developer.mozilla.org/docs/Web/SVG/Element/feConvolveMatrix */
  feConvolveMatrix: SVGAttributes;
  /** Lights an image using its alpha as a diffuse bump map. https://developer.mozilla.org/docs/Web/SVG/Element/feDiffuseLighting */
  feDiffuseLighting: SVGAttributes;
  /** Displaces an image using another as a map. https://developer.mozilla.org/docs/Web/SVG/Element/feDisplacementMap */
  feDisplacementMap: SVGAttributes;
  /** Distant light source for lighting filters. https://developer.mozilla.org/docs/Web/SVG/Element/feDistantLight */
  feDistantLight: SVGAttributes;
  /** Drop shadow of the input image. https://developer.mozilla.org/docs/Web/SVG/Element/feDropShadow */
  feDropShadow: SVGAttributes;
  /** Fills the filter region with a color. https://developer.mozilla.org/docs/Web/SVG/Element/feFlood */
  feFlood: SVGAttributes;
  /** Transfer function for the alpha channel. https://developer.mozilla.org/docs/Web/SVG/Element/feFuncA */
  feFuncA: SVGAttributes;
  /** Transfer function for the blue channel. https://developer.mozilla.org/docs/Web/SVG/Element/feFuncB */
  feFuncB: SVGAttributes;
  /** Transfer function for the green channel. https://developer.mozilla.org/docs/Web/SVG/Element/feFuncG */
  feFuncG: SVGAttributes;
  /** Transfer function for the red channel. https://developer.mozilla.org/docs/Web/SVG/Element/feFuncR */
  feFuncR: SVGAttributes;
  /** Gaussian blur of the input image. https://developer.mozilla.org/docs/Web/SVG/Element/feGaussianBlur */
  feGaussianBlur: SVGAttributes;
  /** External image as filter input. https://developer.mozilla.org/docs/Web/SVG/Element/feImage */
  feImage: SVGAttributes;
  /** Stacks filter results on top of each other. https://developer.mozilla.org/docs/Web/SVG/Element/feMerge */
  feMerge: SVGAttributes;
  /** One input layer of an `feMerge`. https://developer.mozilla.org/docs/Web/SVG/Element/feMergeNode */
  feMergeNode: SVGAttributes;
  /** Erodes or dilates the input image. https://developer.mozilla.org/docs/Web/SVG/Element/feMorphology */
  feMorphology: SVGAttributes;
  /** Offsets the input image. https://developer.mozilla.org/docs/Web/SVG/Element/feOffset */
  feOffset: SVGAttributes;
  /** Point light source for lighting filters. https://developer.mozilla.org/docs/Web/SVG/Element/fePointLight */
  fePointLight: SVGAttributes;
  /** Lights an image using its alpha as a specular bump map. https://developer.mozilla.org/docs/Web/SVG/Element/feSpecularLighting */
  feSpecularLighting: SVGAttributes;
  /** Spot light source for lighting filters. https://developer.mozilla.org/docs/Web/SVG/Element/feSpotLight */
  feSpotLight: SVGAttributes;
  /** Tiles the input image to fill the region. https://developer.mozilla.org/docs/Web/SVG/Element/feTile */
  feTile: SVGAttributes;
  /** Perlin turbulence noise image. https://developer.mozilla.org/docs/Web/SVG/Element/feTurbulence */
  feTurbulence: SVGAttributes;
  /** Filter effect definition referenced via `filter`. https://developer.mozilla.org/docs/Web/SVG/Element/filter */
  filter: SVGAttributes;
  /** Foreign (e.g. HTML) content inside the SVG. https://developer.mozilla.org/docs/Web/SVG/Element/foreignObject */
  foreignObject: SVGAttributes;
  /** Groups SVG elements. https://developer.mozilla.org/docs/Web/SVG/Element/g */
  g: SVGAttributes;
  /** Raster or SVG image. https://developer.mozilla.org/docs/Web/SVG/Element/image */
  image: SVGAttributes;
  /** Straight line between two points. https://developer.mozilla.org/docs/Web/SVG/Element/line */
  line: SVGAttributes;
  /** Linear color gradient. https://developer.mozilla.org/docs/Web/SVG/Element/linearGradient */
  linearGradient: SVGAttributes;
  /** Arrowhead or marker drawn on path vertices. https://developer.mozilla.org/docs/Web/SVG/Element/marker */
  marker: SVGAttributes;
  /** Luminance/alpha mask referenced via `mask`. https://developer.mozilla.org/docs/Web/SVG/Element/mask */
  mask: SVGAttributes;
  /** Metadata container. https://developer.mozilla.org/docs/Web/SVG/Element/metadata */
  metadata: SVGAttributes;
  /** Motion path reference inside `animateMotion`. https://developer.mozilla.org/docs/Web/SVG/Element/mpath */
  mpath: SVGAttributes;
  /** Generic shape defined by path data (`d`). https://developer.mozilla.org/docs/Web/SVG/Element/path */
  path: SVGAttributes;
  /** Tiled fill pattern referenced from `fill`/`stroke`. https://developer.mozilla.org/docs/Web/SVG/Element/pattern */
  pattern: SVGAttributes;
  /** Closed shape from a list of points. https://developer.mozilla.org/docs/Web/SVG/Element/polygon */
  polygon: SVGAttributes;
  /** Open shape from a list of points. https://developer.mozilla.org/docs/Web/SVG/Element/polyline */
  polyline: SVGAttributes;
  /** Radial color gradient. https://developer.mozilla.org/docs/Web/SVG/Element/radialGradient */
  radialGradient: SVGAttributes;
  /** Rectangle, optionally with rounded corners. https://developer.mozilla.org/docs/Web/SVG/Element/rect */
  rect: SVGAttributes;
  /** Sets an attribute value for a duration. https://developer.mozilla.org/docs/Web/SVG/Element/set */
  set: SVGAttributes;
  /** Color stop of a gradient. https://developer.mozilla.org/docs/Web/SVG/Element/stop */
  stop: SVGAttributes;
  /** First matching child renders, by conditional attributes. https://developer.mozilla.org/docs/Web/SVG/Element/switch */
  switch: SVGAttributes;
  /** Reusable template instantiated with `<use>`. https://developer.mozilla.org/docs/Web/SVG/Element/symbol */
  symbol: SVGAttributes;
  /** Text content in the SVG. https://developer.mozilla.org/docs/Web/SVG/Element/text */
  text: SVGAttributes;
  /** Text laid out along a path. https://developer.mozilla.org/docs/Web/SVG/Element/textPath */
  textPath: SVGAttributes;
  /** Positioned span within `<text>`. https://developer.mozilla.org/docs/Web/SVG/Element/tspan */
  tspan: SVGAttributes;
  /** Instantiates a referenced element. https://developer.mozilla.org/docs/Web/SVG/Element/use */
  use: SVGAttributes;
  /** Predefined view of the SVG referenced by fragment. https://developer.mozilla.org/docs/Web/SVG/Element/view */
  view: SVGAttributes;
}

/**
 * Every HTML tag Janux renders, mapped to its typed attribute surface. Hover
 * any tag for what it is; hover an attribute for what it does.
 */
export interface JanuxHTMLElements {
  /** Hyperlink to a page, file, email address or any URL. https://developer.mozilla.org/docs/Web/HTML/Element/a */
  a: AnchorHTMLAttributes;
  /** Abbreviation or acronym, expanded via `title`. https://developer.mozilla.org/docs/Web/HTML/Element/abbr */
  abbr: HTMLAttributes;
  /** Contact information for its nearest article or document. https://developer.mozilla.org/docs/Web/HTML/Element/address */
  address: HTMLAttributes;
  /** Hot-spot region on an image map. https://developer.mozilla.org/docs/Web/HTML/Element/area */
  area: AreaHTMLAttributes;
  /** Self-contained composition: a post, an article, a comment. https://developer.mozilla.org/docs/Web/HTML/Element/article */
  article: HTMLAttributes;
  /** Content indirectly related to the main content. https://developer.mozilla.org/docs/Web/HTML/Element/aside */
  aside: HTMLAttributes;
  /** Embedded sound content. https://developer.mozilla.org/docs/Web/HTML/Element/audio */
  audio: AudioHTMLAttributes;
  /** Draws attention to text without marking it important. https://developer.mozilla.org/docs/Web/HTML/Element/b */
  b: HTMLAttributes;
  /** Base URL for every relative URL in the document. https://developer.mozilla.org/docs/Web/HTML/Element/base */
  base: BaseHTMLAttributes;
  /** Isolates bidirectional text from its surroundings. https://developer.mozilla.org/docs/Web/HTML/Element/bdi */
  bdi: HTMLAttributes;
  /** Overrides the current text direction. https://developer.mozilla.org/docs/Web/HTML/Element/bdo */
  bdo: HTMLAttributes;
  /** Extended quotation, with an optional `cite` source. https://developer.mozilla.org/docs/Web/HTML/Element/blockquote */
  blockquote: QuoteHTMLAttributes;
  /** Content of the document; only one per document. https://developer.mozilla.org/docs/Web/HTML/Element/body */
  body: HTMLAttributes;
  /** Line break. https://developer.mozilla.org/docs/Web/HTML/Element/br */
  br: HTMLAttributes;
  /** Clickable button. https://developer.mozilla.org/docs/Web/HTML/Element/button */
  button: ButtonHTMLAttributes;
  /** Scriptable bitmap drawing surface. https://developer.mozilla.org/docs/Web/HTML/Element/canvas */
  canvas: CanvasHTMLAttributes;
  /** Title of its parent table. https://developer.mozilla.org/docs/Web/HTML/Element/caption */
  caption: HTMLAttributes;
  /** Title of a creative work. https://developer.mozilla.org/docs/Web/HTML/Element/cite */
  cite: HTMLAttributes;
  /** Fragment of computer code. https://developer.mozilla.org/docs/Web/HTML/Element/code */
  code: HTMLAttributes;
  /** Column within a table's column group. https://developer.mozilla.org/docs/Web/HTML/Element/col */
  col: ColHTMLAttributes;
  /** Group of columns within a table. https://developer.mozilla.org/docs/Web/HTML/Element/colgroup */
  colgroup: ColHTMLAttributes;
  /** Content with a machine-readable `value`. https://developer.mozilla.org/docs/Web/HTML/Element/data */
  data: DataHTMLAttributes;
  /** Autocomplete options for an `<input list>`. https://developer.mozilla.org/docs/Web/HTML/Element/datalist */
  datalist: HTMLAttributes;
  /** Description for the preceding `<dt>` term. https://developer.mozilla.org/docs/Web/HTML/Element/dd */
  dd: HTMLAttributes;
  /** Text removed from the document. https://developer.mozilla.org/docs/Web/HTML/Element/del */
  del: ModHTMLAttributes;
  /** Disclosure widget that opens to reveal its content. https://developer.mozilla.org/docs/Web/HTML/Element/details */
  details: DetailsHTMLAttributes;
  /** Term being defined by its surrounding content. https://developer.mozilla.org/docs/Web/HTML/Element/dfn */
  dfn: HTMLAttributes;
  /** Modal or non-modal dialog box. https://developer.mozilla.org/docs/Web/HTML/Element/dialog */
  dialog: DialogHTMLAttributes;
  /** Generic flow container. https://developer.mozilla.org/docs/Web/HTML/Element/div */
  div: HTMLAttributes;
  /** Description list of term/description groups. https://developer.mozilla.org/docs/Web/HTML/Element/dl */
  dl: HTMLAttributes;
  /** Term described by the following `<dd>`. https://developer.mozilla.org/docs/Web/HTML/Element/dt */
  dt: HTMLAttributes;
  /** Stress emphasis. https://developer.mozilla.org/docs/Web/HTML/Element/em */
  em: HTMLAttributes;
  /** External content embedded at this point. https://developer.mozilla.org/docs/Web/HTML/Element/embed */
  embed: EmbedHTMLAttributes;
  /** Groups related form controls under a `<legend>`. https://developer.mozilla.org/docs/Web/HTML/Element/fieldset */
  fieldset: FieldsetHTMLAttributes;
  /** Caption of its parent `<figure>`. https://developer.mozilla.org/docs/Web/HTML/Element/figcaption */
  figcaption: HTMLAttributes;
  /** Self-contained content referenced from the main flow. https://developer.mozilla.org/docs/Web/HTML/Element/figure */
  figure: HTMLAttributes;
  /** Footer of its nearest sectioning content. https://developer.mozilla.org/docs/Web/HTML/Element/footer */
  footer: HTMLAttributes;
  /** Interactive controls that submit information. In Janux, bind `onSubmit={intents.x}` and add `reset` to empty it after. https://developer.mozilla.org/docs/Web/HTML/Element/form */
  form: FormHTMLAttributes;
  /** Section heading, highest rank. https://developer.mozilla.org/docs/Web/HTML/Element/Heading_Elements */
  h1: HTMLAttributes;
  /** Section heading, rank 2. https://developer.mozilla.org/docs/Web/HTML/Element/Heading_Elements */
  h2: HTMLAttributes;
  /** Section heading, rank 3. https://developer.mozilla.org/docs/Web/HTML/Element/Heading_Elements */
  h3: HTMLAttributes;
  /** Section heading, rank 4. https://developer.mozilla.org/docs/Web/HTML/Element/Heading_Elements */
  h4: HTMLAttributes;
  /** Section heading, rank 5. https://developer.mozilla.org/docs/Web/HTML/Element/Heading_Elements */
  h5: HTMLAttributes;
  /** Section heading, lowest rank. https://developer.mozilla.org/docs/Web/HTML/Element/Heading_Elements */
  h6: HTMLAttributes;
  /** Machine-readable metadata of the document. https://developer.mozilla.org/docs/Web/HTML/Element/head */
  head: HTMLAttributes;
  /** Introductory content or navigational aids. https://developer.mozilla.org/docs/Web/HTML/Element/header */
  header: HTMLAttributes;
  /** Heading grouped with subheadings. https://developer.mozilla.org/docs/Web/HTML/Element/hgroup */
  hgroup: HTMLAttributes;
  /** Thematic break between paragraph-level elements. https://developer.mozilla.org/docs/Web/HTML/Element/hr */
  hr: HTMLAttributes;
  /** Root of the document. https://developer.mozilla.org/docs/Web/HTML/Element/html */
  html: HtmlHTMLAttributes;
  /** Text in an alternate voice or mood, like a technical term. https://developer.mozilla.org/docs/Web/HTML/Element/i */
  i: HTMLAttributes;
  /** Nested browsing context embedding another page. https://developer.mozilla.org/docs/Web/HTML/Element/iframe */
  iframe: IframeHTMLAttributes;
  /** Embedded image. https://developer.mozilla.org/docs/Web/HTML/Element/img */
  img: ImgHTMLAttributes;
  /** Interactive form control. https://developer.mozilla.org/docs/Web/HTML/Element/input */
  input: InputHTMLAttributes;
  /** Text added to the document. https://developer.mozilla.org/docs/Web/HTML/Element/ins */
  ins: ModHTMLAttributes;
  /** User keyboard input. https://developer.mozilla.org/docs/Web/HTML/Element/kbd */
  kbd: HTMLAttributes;
  /** Caption for a form control, bound via `for`. https://developer.mozilla.org/docs/Web/HTML/Element/label */
  label: LabelHTMLAttributes;
  /** Caption of its parent `<fieldset>`. https://developer.mozilla.org/docs/Web/HTML/Element/legend */
  legend: HTMLAttributes;
  /** List item. https://developer.mozilla.org/docs/Web/HTML/Element/li */
  li: LiHTMLAttributes;
  /** Relationship to an external resource: stylesheet, icon, preload… https://developer.mozilla.org/docs/Web/HTML/Element/link */
  link: LinkHTMLAttributes;
  /** Dominant content of the document; only one per page. https://developer.mozilla.org/docs/Web/HTML/Element/main */
  main: HTMLAttributes;
  /** Image map, referenced from `<img useMap>`. https://developer.mozilla.org/docs/Web/HTML/Element/map */
  map: MapHTMLAttributes;
  /** Text highlighted for reference. https://developer.mozilla.org/docs/Web/HTML/Element/mark */
  mark: HTMLAttributes;
  /** Unordered list of commands or links. https://developer.mozilla.org/docs/Web/HTML/Element/menu */
  menu: HTMLAttributes;
  /** Document metadata no other element expresses. https://developer.mozilla.org/docs/Web/HTML/Element/meta */
  meta: MetaHTMLAttributes;
  /** Scalar value within a known range, like a gauge. https://developer.mozilla.org/docs/Web/HTML/Element/meter */
  meter: MeterHTMLAttributes;
  /** Section of navigation links. https://developer.mozilla.org/docs/Web/HTML/Element/nav */
  nav: HTMLAttributes;
  /** Fallback content when scripting is unavailable. https://developer.mozilla.org/docs/Web/HTML/Element/noscript */
  noscript: HTMLAttributes;
  /** External resource: image, nested context or plugin content. https://developer.mozilla.org/docs/Web/HTML/Element/object */
  object: ObjectHTMLAttributes;
  /** Ordered list. https://developer.mozilla.org/docs/Web/HTML/Element/ol */
  ol: OlHTMLAttributes;
  /** Group of options inside a `<select>`. https://developer.mozilla.org/docs/Web/HTML/Element/optgroup */
  optgroup: OptgroupHTMLAttributes;
  /** Option inside a `<select>` or `<datalist>`. https://developer.mozilla.org/docs/Web/HTML/Element/option */
  option: OptionHTMLAttributes;
  /** Result of a calculation or user action. https://developer.mozilla.org/docs/Web/HTML/Element/output */
  output: OutputHTMLAttributes;
  /** Paragraph. https://developer.mozilla.org/docs/Web/HTML/Element/p */
  p: HTMLAttributes;
  /** Alternative `<source>`s for its `<img>`. https://developer.mozilla.org/docs/Web/HTML/Element/picture */
  picture: HTMLAttributes;
  /** Preformatted text, rendered as written. https://developer.mozilla.org/docs/Web/HTML/Element/pre */
  pre: HTMLAttributes;
  /** Completion progress of a task. https://developer.mozilla.org/docs/Web/HTML/Element/progress */
  progress: ProgressHTMLAttributes;
  /** Short inline quotation. https://developer.mozilla.org/docs/Web/HTML/Element/q */
  q: QuoteHTMLAttributes;
  /** Fallback parentheses for browsers without ruby support. https://developer.mozilla.org/docs/Web/HTML/Element/rp */
  rp: HTMLAttributes;
  /** Ruby text: pronunciation of East Asian characters. https://developer.mozilla.org/docs/Web/HTML/Element/rt */
  rt: HTMLAttributes;
  /** Ruby annotation over base text. https://developer.mozilla.org/docs/Web/HTML/Element/ruby */
  ruby: HTMLAttributes;
  /** Content no longer accurate or relevant (strikethrough). https://developer.mozilla.org/docs/Web/HTML/Element/s */
  s: HTMLAttributes;
  /** Sample output of a program. https://developer.mozilla.org/docs/Web/HTML/Element/samp */
  samp: HTMLAttributes;
  /** Executable code or data block. https://developer.mozilla.org/docs/Web/HTML/Element/script */
  script: ScriptHTMLAttributes;
  /** Container whose content is search or filtering controls. https://developer.mozilla.org/docs/Web/HTML/Element/search */
  search: HTMLAttributes;
  /** Generic standalone section of the document. https://developer.mozilla.org/docs/Web/HTML/Element/section */
  section: HTMLAttributes;
  /** Menu of options. https://developer.mozilla.org/docs/Web/HTML/Element/select */
  select: SelectHTMLAttributes;
  /** Placeholder a shadow root fills with light-DOM children. https://developer.mozilla.org/docs/Web/HTML/Element/slot */
  slot: SlotHTMLAttributes;
  /** Side comments and small print. https://developer.mozilla.org/docs/Web/HTML/Element/small */
  small: HTMLAttributes;
  /** Media resource candidate for `<picture>`, `<audio>` or `<video>`. https://developer.mozilla.org/docs/Web/HTML/Element/source */
  source: SourceHTMLAttributes;
  /** Generic inline container. https://developer.mozilla.org/docs/Web/HTML/Element/span */
  span: HTMLAttributes;
  /** Strong importance. https://developer.mozilla.org/docs/Web/HTML/Element/strong */
  strong: HTMLAttributes;
  /** Style information for the document. https://developer.mozilla.org/docs/Web/HTML/Element/style */
  style: StyleHTMLAttributes;
  /** Subscript. https://developer.mozilla.org/docs/Web/HTML/Element/sub */
  sub: HTMLAttributes;
  /** Summary/caption for its parent `<details>`. https://developer.mozilla.org/docs/Web/HTML/Element/summary */
  summary: HTMLAttributes;
  /** Superscript. https://developer.mozilla.org/docs/Web/HTML/Element/sup */
  sup: HTMLAttributes;
  /** Tabular data: rows and columns of cells. https://developer.mozilla.org/docs/Web/HTML/Element/table */
  table: HTMLAttributes;
  /** Block of rows forming the table body. https://developer.mozilla.org/docs/Web/HTML/Element/tbody */
  tbody: HTMLAttributes;
  /** Data cell of a table. https://developer.mozilla.org/docs/Web/HTML/Element/td */
  td: TdHTMLAttributes;
  /** Inert content cloned via scripting, or a declarative shadow root. https://developer.mozilla.org/docs/Web/HTML/Element/template */
  template: TemplateHTMLAttributes;
  /** Multi-line plain-text form control. https://developer.mozilla.org/docs/Web/HTML/Element/textarea */
  textarea: TextareaHTMLAttributes;
  /** Block of rows summarizing the table's columns. https://developer.mozilla.org/docs/Web/HTML/Element/tfoot */
  tfoot: HTMLAttributes;
  /** Header cell of a table. https://developer.mozilla.org/docs/Web/HTML/Element/th */
  th: ThHTMLAttributes;
  /** Block of rows forming the table's column headers. https://developer.mozilla.org/docs/Web/HTML/Element/thead */
  thead: HTMLAttributes;
  /** Specific period in time, machine-readable via `dateTime`. https://developer.mozilla.org/docs/Web/HTML/Element/time */
  time: TimeHTMLAttributes;
  /** Document title shown in the browser tab. https://developer.mozilla.org/docs/Web/HTML/Element/title */
  title: HTMLAttributes;
  /** Row of table cells. https://developer.mozilla.org/docs/Web/HTML/Element/tr */
  tr: HTMLAttributes;
  /** Timed text track for media: subtitles, captions… https://developer.mozilla.org/docs/Web/HTML/Element/track */
  track: TrackHTMLAttributes;
  /** Unarticulated annotation, like misspelled text. https://developer.mozilla.org/docs/Web/HTML/Element/u */
  u: HTMLAttributes;
  /** Unordered list. https://developer.mozilla.org/docs/Web/HTML/Element/ul */
  ul: HTMLAttributes;
  /** Variable in a mathematical or programming context. https://developer.mozilla.org/docs/Web/HTML/Element/var */
  var: HTMLAttributes;
  /** Embedded video with playback. https://developer.mozilla.org/docs/Web/HTML/Element/video */
  video: VideoHTMLAttributes;
  /** Word-break opportunity. https://developer.mozilla.org/docs/Web/HTML/Element/wbr */
  wbr: HTMLAttributes;
}
