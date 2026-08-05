import { describe, expect, it } from 'bun:test';
import { bool, list, obj, schema, str, toJsonSchema } from '../schema';
import { hasUntrusted, untrustedFields } from './fields';

const comments = schema({
  title: str(),
  body: str().untrusted(),
  authors: list({ name: str().untrusted(), verified: bool() }),
  meta: obj({ note: str().untrusted(), slug: str() }),
});

describe('.untrusted()', () => {
  it('marks the field without changing what it validates', () => {
    const field = str().min(2).untrusted();

    expect(field.flags.untrusted).toBe(true);
    expect(field.flags.min).toBe(2);
    expect(field.kind).toBe('string');
  });

  it('survives further refinement, in either order', () => {
    expect(str().untrusted().optional().flags.untrusted).toBe(true);
    expect(str().optional().untrusted().flags.optional).toBe(true);
  });

  /** MCP clients read the JSON Schema; the provenance has to reach them too. */
  it('travels in the JSON Schema projection', () => {
    const projected = toJsonSchema(comments) as any;

    expect(projected.properties.body['x-janux-untrusted']).toBe(true);
    expect(projected.properties.title['x-janux-untrusted']).toBeUndefined();
  });
});

describe('untrustedFields', () => {
  it('names every path fed by untrusted input', () => {
    expect(untrustedFields(comments)).toEqual(['body', 'authors[].name', 'meta.note']);
  });

  it('is empty for a schema nobody feeds', () => {
    expect(untrustedFields(schema({ count: str() }))).toEqual([]);
    expect(untrustedFields(undefined)).toEqual([]);
  });

  it('reports a whole list marked at the item level', () => {
    expect(untrustedFields(schema({ tags: list(str().untrusted()) }))).toEqual(['tags[]']);
  });
});

describe('hasUntrusted', () => {
  it('answers the one question the page projection asks', () => {
    expect(hasUntrusted(comments)).toBe(true);
    expect(hasUntrusted(schema({ count: str() }))).toBe(false);
    expect(hasUntrusted(undefined)).toBe(false);
  });
});
