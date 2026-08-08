import { JxType, type InferShape } from './types';

export type Shape = Record<string, JxType<any>>;
export type ShapeOrType = JxType<any> | Shape;

function toType(input: ShapeOrType): JxType<any> {
  return input instanceof JxType ? input : obj(input);
}

export function str(): JxType<string> {
  return new JxType('string');
}

export function int(): JxType<number> {
  return new JxType('int');
}

export function num(): JxType<number> {
  return new JxType('number');
}

export function bool(): JxType<boolean> {
  return new JxType('boolean');
}

/** Monetary amount in minor units (cents). Serializes as integer. */
export function money(): JxType<number> {
  return new JxType('money');
}

export function enums<const V extends readonly string[]>(values: V): JxType<V[number]> {
  return new JxType('enum', { values });
}

export function list<T>(item: JxType<T>): JxType<T[]>;
export function list<S extends Shape>(shape: S): JxType<InferShape<S>[]>;
export function list(itemOrShape: ShapeOrType): JxType<any> {
  return new JxType('list', { item: toType(itemOrShape) });
}

export function obj<S extends Shape>(shape: S): JxType<InferShape<S>> {
  return new JxType('object', { shape });
}

/**
 * An arbitrary JSON-serializable value, passed through untouched — no shape,
 * no key stripping. For payloads whose structure the app does not own
 * (interop props bundles, embedded documents). Prefer `obj()` when the shape
 * is known: `json()` gives agents no contract to validate against.
 */
export function json(): JxType<unknown> {
  return new JxType('json');
}

/** Root schema for component/store state and intent/api inputs. */
export function schema<S extends Shape>(shape: S): JxType<InferShape<S>> {
  return obj(shape);
}
