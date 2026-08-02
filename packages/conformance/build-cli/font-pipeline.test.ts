import { describe, expect } from 'bun:test';
import { runCases } from '../support/scenario';
import {
  CSS_PARSE_CASES,
  FACE_SELECTION_CASES,
  FONT_REQUEST_CASES,
  NOTHING_SELECTED_CASES,
  PRIMARY_FACE_CASES,
  googleCssUrl,
  nothingSelected,
  parseGoogleCss,
  primaryFace,
  selectFaces,
  type FaceFixture,
} from './font-pipeline.cases';

/** A published face, in the shape the parser hands the selector. */
function face(fixture: FaceFixture) {
  return {
    subset: fixture.subset,
    weight: fixture.weight,
    style: fixture.style,
    url: `https://fonts.gstatic.com/${fixture.file}.woff2`,
    unicodeRange: 'U+0000-00FF',
    preload: false,
  };
}

const label = (selected: { subset: string; weight: number; style: string }) =>
  `${selected.subset}/${selected.weight}/${selected.style}`;

describe('the stylesheet a font primitive requests', () =>
  runCases(FONT_REQUEST_CASES, (row) => {
    const url = googleCssUrl(row.config as never);

    expect(url).toBe(`https://fonts.googleapis.com/css2?family=${row.family}&display=${row.display ?? 'swap'}`);
  }));

describe('the faces an app actually ships', () =>
  runCases(FACE_SELECTION_CASES, (row) => {
    const selected = selectFaces(row.published.map(face), row.config as never);

    expect(selected.map(label)).toEqual(row.kept);
    expect(selected.flatMap((candidate, index) => (candidate.preload ? [index] : []))).toEqual(
      row.preloaded === undefined ? [] : [row.preloaded],
    );
  }));

describe('the face a family is measured from', () =>
  runCases(PRIMARY_FACE_CASES, (row) => {
    expect(primaryFace(row.published.map(face), row.config as never).url).toContain(`/${row.file}.woff2`);
  }));

describe('reading what Google answered', () =>
  runCases(CSS_PARSE_CASES, (row) => {
    expect(parseGoogleCss(row.css).map(({ preload: _preload, ...rest }) => rest)).toEqual(row.faces);
  }));

describe('a font that resolved to nothing', () =>
  runCases(NOTHING_SELECTED_CASES, (row) => {
    const message = nothingSelected(row.config as never);

    row.says.forEach((part) => expect(message).toContain(part));
  }));
