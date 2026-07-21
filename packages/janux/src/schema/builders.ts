import { JxType } from './types';

export type Shape = Record<string, JxType>;
export type ShapeOrType = JxType | Shape;

function toType(input: ShapeOrType): JxType {
  return input instanceof JxType ? input : obj(input);
}

export function str(): JxType {
  return new JxType('string');
}

export function int(): JxType {
  return new JxType('int');
}

export function num(): JxType {
  return new JxType('number');
}

export function bool(): JxType {
  return new JxType('boolean');
}

/** Monetary amount in minor units (cents). Serializes as integer. */
export function money(): JxType {
  return new JxType('money');
}

export function enums(values: readonly string[]): JxType {
  return new JxType('enum', { values });
}

export function list(itemOrShape: ShapeOrType): JxType {
  return new JxType('list', { item: toType(itemOrShape) });
}

export function obj(shape: Shape): JxType {
  return new JxType('object', { shape });
}

/** Root schema for component/store state and intent/api inputs. */
export function schema(shape: Shape): JxType {
  return obj(shape);
}
