export type JxKind =
  | 'string'
  | 'int'
  | 'number'
  | 'boolean'
  | 'money'
  | 'enum'
  | 'list'
  | 'object';

export interface JxFlags {
  optional?: boolean;
  nullable?: boolean;
  defaultValue?: unknown;
  min?: number;
  max?: number;
  /** Fed by input the app did not author — see `janux/taint`. */
  untrusted?: boolean;
}

/**
 * Values a field accepts *right now*, resolved against the live run bag. Typed
 * loosely on purpose: the schema layer cannot import `RunBag` without a cycle.
 */
export type OptionsResolver = (bag: any) => readonly unknown[];

export interface JxExtra {
  values?: readonly string[];
  item?: JxType;
  shape?: Record<string, JxType>;
  optionsOf?: OptionsResolver;
}

const BOUNDED_KINDS = new Set<JxKind>(['string', 'int', 'number', 'money']);

/**
 * The value a schema describes, read back as a type: `Infer<typeof post>`.
 *
 * A schema is already the only description of a shape Janux has — it validates
 * component state, intent input and content frontmatter — so the value side of
 * that shape should be readable without restating it as an interface. `JxType`
 * carries it in a phantom parameter, which is why `str()` and `int()` are
 * different types even though the class is one.
 */
export type Infer<S> = S extends JxType<infer T> ? T : never;

/** Every field of a shape, inferred. */
export type InferShape<S> = { [K in keyof S]: Infer<S[K]> };

/**
 * `out` because a schema only ever *produces* its value: `JxType<string>` has
 * to stay usable everywhere a plain `JxType` is annotated, which is what keeps
 * the parameter additive for code written before it existed.
 */
export class JxType<out T = unknown> {
  /**
   * Phantom carrier for `Infer`. Declared, never assigned — it exists so the
   * parameter is used, which is what makes the class generic in practice.
   */
  declare readonly __value?: T;
  readonly kind: JxKind;
  readonly flags: JxFlags;
  readonly values?: readonly string[];
  readonly item?: JxType;
  readonly shape?: Record<string, JxType>;
  readonly optionsOf?: OptionsResolver;

  constructor(kind: JxKind, extra: JxExtra = {}, flags: JxFlags = {}) {
    this.kind = kind;
    this.flags = flags;
    this.values = extra.values;
    this.item = extra.item;
    this.shape = extra.shape;
    this.optionsOf = extra.optionsOf;
  }

  private with(patch: JxFlags, extra: JxExtra = {}): JxType<any> {
    const carried = { values: this.values, item: this.item, shape: this.shape, optionsOf: this.optionsOf };

    return new JxType(this.kind, { ...carried, ...extra }, { ...this.flags, ...patch });
  }

  /**
   * The values this field accepts right now, resolved per instance when the
   * manifest is built — the value-level twin of an intent's `ready`. Advisory:
   * validation is unchanged, so a list that goes stale never rejects a caller.
   */
  options(resolve: OptionsResolver): JxType<T> {
    return this.with({}, { optionsOf: resolve });
  }

  optional(): JxType<T | undefined> {
    return this.with({ optional: true });
  }

  nullable(): JxType<T | null> {
    return this.with({ nullable: true });
  }

  /**
   * Untyped on purpose. A default is validated at runtime like any other value
   * (see `validate`), and that guard is the contract — the conformance corpus
   * exists to state what a wrong default does. Narrowing this to `T` would make
   * those cases unwritable without casts, trading a real, tested rule for a
   * compile-time one.
   */
  default(value: unknown): JxType<T> {
    return this.with({ defaultValue: value });
  }

  /**
   * Declares that this field carries content the app did not author — a
   * visitor's comment, a scraped bio, an imported description. Validation is
   * unchanged; what changes is what a chain that read it may do, and that the
   * agent surface says so where the value is projected (see `janux/taint`).
   */
  untrusted(): JxType<T> {
    return this.with({ untrusted: true });
  }

  min(value: number): JxType<T> {
    this.assertBounded('min');

    return this.with({ min: value });
  }

  max(value: number): JxType<T> {
    this.assertBounded('max');

    return this.with({ max: value });
  }

  /**
   * Bounds mean length for a string and value for a number. On any other kind the
   * flag was simply never read — `list(int()).min(2)` accepted `[1]` and
   * `bool().min(2)` rejected `true` with "below min 2". A constraint that
   * silently does nothing is worse than one that refuses to be written.
   */
  private assertBounded(method: string): void {
    if (BOUNDED_KINDS.has(this.kind)) return;

    throw new Error(
      `Janux: ${method}() is not defined for ${this.kind} — bounds are length for strings and value for numbers.`,
    );
  }
}
