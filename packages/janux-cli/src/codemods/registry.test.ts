import { describe, expect, it } from 'bun:test';
import { CODEMODS, codemodById, codemodsBetween } from './registry';

describe('the codemod registry', () => {
  it('gives every codemod an id, a title and a description', () => {
    for (const codemod of CODEMODS) {
      expect(codemod.id).toMatch(/^[\w.]+\/[\w-]+$/);
      expect(codemod.title.length).toBeGreaterThan(0);
      expect(codemod.description.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate ids, because an id is what `janux codemod` takes', () => {
    expect(new Set(CODEMODS.map((codemod) => codemod.id)).size).toBe(CODEMODS.length);
  });

  it('finds a codemod by id', () => {
    expect(codemodById('0.5.0/events-by-name')?.since).toBe('0.5.0');
    expect(codemodById('nope/nope')).toBeUndefined();
  });

  it('names a versioned codemod after the release it repairs', () => {
    const versioned = CODEMODS.filter((codemod) => codemod.since);

    expect(versioned.every((codemod) => codemod.id.startsWith(`${codemod.since}/`))).toBe(true);
  });
});

describe('codemodsBetween', () => {
  it('includes a codemod for a release the upgrade crosses', () => {
    expect(codemodsBetween('0.4.0', '0.6.0').map((codemod) => codemod.id)).toEqual(['0.5.0/events-by-name']);
  });

  it('excludes the version already installed — its break was absorbed on the way in', () => {
    expect(codemodsBetween('0.5.0', '0.6.0')).toEqual([]);
  });

  it('includes it when upgrading exactly onto the breaking release', () => {
    expect(codemodsBetween('0.4.0', '0.5.0').map((codemod) => codemod.id)).toEqual(['0.5.0/events-by-name']);
  });

  it('reaches back to any older version, since 0.x minors are the breaking bumps', () => {
    expect(codemodsBetween('0.3.0', '0.6.0').map((codemod) => codemod.id)).toEqual(['0.5.0/events-by-name']);
  });

  it('never includes a framework migration: those are asked for by name', () => {
    expect(codemodsBetween('0.1.0', '99.0.0').every((codemod) => codemod.since)).toBe(true);
  });

  it('answers nothing when the target is not ahead of what is installed', () => {
    expect(codemodsBetween('0.6.0', '0.6.0')).toEqual([]);
    expect(codemodsBetween('0.6.0', '0.4.0')).toEqual([]);
  });

  it('compares numerically, not as strings — 0.10.0 is after 0.9.0', () => {
    expect(codemodsBetween('0.9.0', '0.10.0')).toEqual([]);
    expect(codemodsBetween('0.4.0', '0.10.0').map((codemod) => codemod.id)).toEqual(['0.5.0/events-by-name']);
  });

  it('tolerates a prerelease tag on either end', () => {
    expect(codemodsBetween('0.4.0-beta.1', '0.6.0').map((codemod) => codemod.id)).toEqual(['0.5.0/events-by-name']);
  });
});
