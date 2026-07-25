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
}

export interface JxExtra {
  values?: readonly string[];
  item?: JxType;
  shape?: Record<string, JxType>;
}

const BOUNDED_KINDS = new Set<JxKind>(['string', 'int', 'number', 'money']);

export class JxType {
  readonly kind: JxKind;
  readonly flags: JxFlags;
  readonly values?: readonly string[];
  readonly item?: JxType;
  readonly shape?: Record<string, JxType>;

  constructor(kind: JxKind, extra: JxExtra = {}, flags: JxFlags = {}) {
    this.kind = kind;
    this.flags = flags;
    this.values = extra.values;
    this.item = extra.item;
    this.shape = extra.shape;
  }

  private with(patch: JxFlags): JxType {
    const extra = { values: this.values, item: this.item, shape: this.shape };

    return new JxType(this.kind, extra, { ...this.flags, ...patch });
  }

  optional(): JxType {
    return this.with({ optional: true });
  }

  nullable(): JxType {
    return this.with({ nullable: true });
  }

  default(value: unknown): JxType {
    return this.with({ defaultValue: value });
  }

  min(value: number): JxType {
    this.assertBounded('min');

    return this.with({ min: value });
  }

  max(value: number): JxType {
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
