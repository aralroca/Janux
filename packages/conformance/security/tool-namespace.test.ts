import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { TOOL_NAMESPACE_CASES } from './tool-namespace.cases';

describe('tool namespace', () => runScenarios(TOOL_NAMESPACE_CASES));
