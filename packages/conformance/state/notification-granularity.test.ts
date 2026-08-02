import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { NOTIFICATION_CASES } from './notification-granularity.cases';

describe('notification granularity conformance', () => runScenarios(NOTIFICATION_CASES));
