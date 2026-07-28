import { describe, expect, it } from 'bun:test';
import { renderReport, renderSuite } from './report.mjs';

const RESULT = {
	suite: 'demo',
	targets: [
		{ name: 'janux', ops: { run: { score: 12.3, median: 12.0, min: 11.0 } } },
		{ name: 'react', ops: { run: { score: 6.15, median: 6.0, min: 5.0 } } },
	],
};

describe('report', () => {
	it('renders one row per op with scores and the janux/react ratio', () => {
		const md = renderSuite(RESULT);

		expect(md).toContain('### demo');
		expect(md).toContain('| run | 12.30ms | 6.15ms | 2.00× |');
	});

	it('formats byte ops as KB and surfaces gate failures', () => {
		const md = renderSuite({
			suite: 'bytes',
			failed: 'boom',
			targets: [{ name: 'janux', ops: { fw_gzip: { median: 2048, min: 2048 } } }],
		});

		expect(md).toContain('| fw_gzip | 2.0KB | — |');
		expect(md).toContain('gate failures: boom');
	});

	it('joins suites under one heading', () => {
		const md = renderReport([RESULT]);

		expect(md.startsWith('## Benchmark position report')).toBe(true);
	});
});
