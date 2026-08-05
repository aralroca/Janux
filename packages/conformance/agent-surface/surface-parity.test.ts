import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { SURFACE_PARITY_CASES } from './surface-parity.cases';

describe('bridge, MCP and A2A are one pipeline', () => runScenarios(SURFACE_PARITY_CASES));
