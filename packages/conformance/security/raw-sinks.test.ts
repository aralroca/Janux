import { describe } from 'bun:test';
import { runTreeCases } from '../support/html';
import { RAW_SINK_CASES } from './raw-sinks.cases';

describe('raw sinks', () => runTreeCases(RAW_SINK_CASES));
