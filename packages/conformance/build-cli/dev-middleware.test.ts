import { describe, expect } from 'bun:test';
import { runCases } from '../support/scenario';
import {
  DEV_STYLESHEET_CASES,
  FALL_THROUGH_CASES,
  PUBLIC_MIME_CASES,
  devStylesheets,
  fallsThroughToVite,
  mimeFor,
} from './dev-middleware.cases';

describe('what the dev middleware hands back to Vite', () =>
  runCases(FALL_THROUGH_CASES, (row) => {
    const response = new Response(null, {
      status: row.status,
      headers: row.contentType ? { 'content-type': row.contentType } : {},
    });

    expect(fallsThroughToVite(response, row.path)).toBe(row.fallsThrough);
  }));

describe('the stylesheet the dev shell links', () =>
  runCases(DEV_STYLESHEET_CASES, (row) => {
    expect(devStylesheets(row.root, row.stylesheet)).toEqual(row.urls);
  }));

describe('the content type dev serves a public file as', () =>
  runCases(PUBLIC_MIME_CASES, (row) => {
    expect(mimeFor(row.file)).toBe(row.type);
  }));
