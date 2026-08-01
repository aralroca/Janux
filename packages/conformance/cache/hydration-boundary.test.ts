import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { HYDRATION_BOUNDARY_CASES } from './hydration-boundary.cases';

describe('hydration boundary', () => runScenarios(HYDRATION_BOUNDARY_CASES));
