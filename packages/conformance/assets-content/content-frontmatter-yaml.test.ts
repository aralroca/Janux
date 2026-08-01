import { describe, expect } from 'bun:test';
import { parseFrontmatter } from '../../janux-content/src/frontmatter';
import { runCases } from '../support/scenario';
import { YAML_CASES, YAML_ERROR_CASES } from './content-frontmatter-yaml.cases';

/** Every row is the same file with a different block, so the body never varies. */
const file = (yaml: string) => `---\n${yaml}\n---\nBody\n`;

describe('frontmatter value types', () =>
  runCases(YAML_CASES, (row) => {
    expect(parseFrontmatter(file(row.yaml))).toEqual({ data: row.expected, body: 'Body\n' });
  }));

describe('frontmatter refusals', () =>
  runCases(YAML_ERROR_CASES, (row) => {
    expect(() => parseFrontmatter(file(row.yaml), 'posts/a.md')).toThrow(row.expected);
  }));
