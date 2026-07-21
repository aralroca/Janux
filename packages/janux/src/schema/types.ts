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
    return this.with({ min: value });
  }

  max(value: number): JxType {
    return this.with({ max: value });
  }
}
