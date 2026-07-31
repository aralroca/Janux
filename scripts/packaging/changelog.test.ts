import { describe, expect, it } from 'bun:test';
import { prepend, rootSection, topSection, withoutDependencyBumps } from './changelog';

/** What `@changesets/cli/changelog` actually writes for a package in a fixed group. */
const PACKAGE_CHANGELOG = `# @janux/server

## 0.6.0

### Minor Changes

- A multipart body no longer has to fit in memory.

### Patch Changes

- Updated dependencies
  - janux@0.6.0
  - @janux/agent@0.6.0

## 0.5.0

### Minor Changes

- The shell splits around pending suspense boundaries.
`;

describe('topSection', () => {
  it('reads the newest release and stops at the one before it', () => {
    expect(topSection(PACKAGE_CHANGELOG)).toEqual({
      version: '0.6.0',
      body: '### Minor Changes\n\n- A multipart body no longer has to fit in memory.\n\n### Patch Changes\n\n- Updated dependencies\n  - janux@0.6.0\n  - @janux/agent@0.6.0',
    });
  });

  it('reads a changelog with a single release', () => {
    expect(topSection('# janux\n\n## 0.1.0\n\n- first\n')?.version).toBe('0.1.0');
  });

  it('is undefined for a changelog with no releases yet', () => {
    expect(topSection('# janux\n\nNothing released.\n')).toBeUndefined();
  });
});

describe('withoutDependencyBumps', () => {
  it('drops the bump and the heading it leaves empty', () => {
    const body = topSection(PACKAGE_CHANGELOG)!.body;

    expect(withoutDependencyBumps(body)).toBe('### Minor Changes\n\n- A multipart body no longer has to fit in memory.');
  });

  it('keeps a real patch note that sits beside a bump', () => {
    const body = '### Patch Changes\n\n- Updated dependencies\n  - janux@0.6.0\n- The sentinel is keyed again.';

    expect(withoutDependencyBumps(body)).toBe('### Patch Changes\n\n- The sentinel is keyed again.');
  });

  it('empties a section that was nothing but bumps', () => {
    expect(withoutDependencyBumps('### Patch Changes\n\n- Updated dependencies\n  - janux@0.6.0')).toBe('');
  });
});

describe('rootSection', () => {
  const notes = [
    { name: 'janux', body: '### Minor Changes\n\n- `worker()` runs a function off the main thread.' },
    { name: '@janux/vercel', body: '### Patch Changes\n\n- Updated dependencies\n  - janux@0.6.0' },
  ];

  it('nests each package under the release, one heading deeper', () => {
    expect(rootSection('0.6.0', notes)).toBe(
      '## 0.6.0\n\n### janux\n\n#### Minor Changes\n\n- `worker()` runs a function off the main thread.',
    );
  });

  it('omits a package whose only entry was a dependency bump', () => {
    expect(rootSection('0.6.0', notes)).not.toContain('@janux/vercel');
  });

  it('is just the heading when nothing shipped', () => {
    expect(rootSection('0.6.0', [])).toBe('## 0.6.0');
  });
});

describe('prepend', () => {
  const existing = '# Changelog\n\nWhat changed, newest first.\n\n## 0.5.0\n\n- streaming\n';

  it('puts the new release under the prose and above the previous one', () => {
    expect(prepend(existing, '## 0.6.0\n\n- workers')).toBe(
      '# Changelog\n\nWhat changed, newest first.\n\n## 0.6.0\n\n- workers\n\n## 0.5.0\n\n- streaming\n',
    );
  });

  it('appends when the file has no releases yet', () => {
    expect(prepend('# Changelog\n\nWhat changed.\n', '## 0.6.0\n\n- workers')).toBe('# Changelog\n\nWhat changed.\n\n## 0.6.0\n\n- workers\n');
  });
});
