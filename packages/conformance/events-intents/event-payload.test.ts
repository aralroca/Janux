import { describe } from 'bun:test';
import { useDom } from '../support/dom';
import { runScenarios } from '../support/scenario';
import { EVENT_PAYLOAD_CASES } from './event-payload.cases';

useDom();

describe('event payload conformance', () => runScenarios(EVENT_PAYLOAD_CASES));
