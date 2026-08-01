import { describe } from 'bun:test';
import { runScenarios } from '../support/scenario';
import { FOREIGN_DEF_CASES } from './foreign-def.cases';
import { FOREIGN_PROPS_CASES } from './foreign-props.cases';
import { FOREIGN_SSR_CASES } from './foreign-ssr.cases';

describe('foreign(): the definition', () => runScenarios(FOREIGN_DEF_CASES));
describe('foreign(): the props boundary', () => runScenarios(FOREIGN_PROPS_CASES));
describe('foreign(): server rendering', () => runScenarios(FOREIGN_SSR_CASES));
