import { describe, expect, it } from 'bun:test';
import { allowsTool, type ToolFilter } from './index';

describe('allowsTool (public export)', () => {
  it('is exported from the package root with the documented semantics', () => {
    const filter: ToolFilter = { include: ['remote.docs.*'], exclude: ['remote.docs.readDoc'] };

    expect(allowsTool('remote.docs.listDocs', filter)).toBe(true);
    expect(allowsTool('remote.docs.readDoc', filter)).toBe(false);
    expect(allowsTool('remote.other', filter)).toBe(false);
  });

  it('no filter (or an empty include) allows everything, exclude still wins', () => {
    expect(allowsTool('anything', undefined)).toBe(true);
    expect(allowsTool('anything', { include: [] })).toBe(true);
    expect(allowsTool('secret.tool', { exclude: ['secret.*'] })).toBe(false);
  });
});
