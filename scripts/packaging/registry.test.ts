import { describe, expect, it } from 'bun:test';
import { canAttestProvenance, publishArgs } from './registry';

const OIDC = { ACTIONS_ID_TOKEN_REQUEST_URL: 'https://token', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'jwt' };

describe('canAttestProvenance', () => {
  it('is true only when the workflow was granted an OIDC token', () => {
    expect(canAttestProvenance(OIDC)).toBe(true);
  });

  it('is false with the URL but no token, which is what a missing `id-token: write` looks like', () => {
    expect(canAttestProvenance({ ACTIONS_ID_TOKEN_REQUEST_URL: 'https://token' })).toBe(false);
  });

  it('is false on a laptop', () => {
    expect(canAttestProvenance({})).toBe(false);
  });
});

describe('publishArgs', () => {
  it('signs the upload when provenance is available', () => {
    expect(publishArgs('.packed/janux/janux-0.5.0.tgz', { dryRun: false, provenance: true })).toEqual([
      'publish',
      '.packed/janux/janux-0.5.0.tgz',
      '--access',
      'public',
      '--provenance',
    ]);
  });

  it('omits --provenance where npm would refuse to generate it', () => {
    expect(publishArgs('x.tgz', { dryRun: false, provenance: false })).not.toContain('--provenance');
  });

  it('keeps provenance on a dry run, so the workflow rehearses the real command', () => {
    expect(publishArgs('x.tgz', { dryRun: true, provenance: true })).toEqual(['publish', 'x.tgz', '--access', 'public', '--provenance', '--dry-run']);
  });

  it('always publishes the tarball, never the working directory', () => {
    expect(publishArgs('x.tgz', { dryRun: false, provenance: true })[1]).toBe('x.tgz');
  });
});
