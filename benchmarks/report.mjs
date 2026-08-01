// Position report: renders benchmarks/results/*.json as markdown tables —
// per suite, targets × ops with the score and the janux/react ratio. Pure
// rendering; measuring is bench.mjs's job.
//
// Usage:
//   node benchmarks/report.mjs                # all results, markdown to stdout
//   node benchmarks/report.mjs js-framework   # selected suites
import fs from 'node:fs';
import { scoreOf } from './lib/stats.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RESULTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'results');


const isBytes = (op) => /_(raw|gzip|brotli)$/.test(op);
const isCount = (op) => /^(nodes|elements|text|comments|empty_text|whitespace_text)_/.test(op);

const fmt = (value, op) => {
	if (value == null) return '—';
	if (isBytes(op)) return `${(value / 1024).toFixed(1)}KB`;
	if (isCount(op)) return String(value);

	return `${value.toFixed(2)}ms`;
};

// Signed so the direction is readable in every cell: `+N×` means janux is N
// times better (lower) than react, `-N×` means N times worse. Magnitude ≥ 1.
const ratioCell = (value, reference) => {
	if (value == null || reference == null || reference === 0 || value === 0) return '—';

	return value <= reference
		? `+${(reference / value).toFixed(2)}×`
		: `-${(value / reference).toFixed(2)}×`;
};

export function renderSuite(result) {
	const targets = result.targets;
	const ops = [...new Set(targets.flatMap((t) => Object.keys(t.ops)))];
	const react = targets.find((t) => t.name === 'react');
	const lines = [
		`### ${result.suite}`,
		'',
		`| op | ${targets.map((t) => t.name).join(' | ')} | janux/react |`,
		`|---|${targets.map(() => '---').join('|')}|---|`,
	];
	const janux = targets.find((t) => t.name === 'janux');

	ops.forEach((op) => {
		const cells = targets.map((t) => fmt(scoreOf(t.ops[op]), op));
		const ratio = ratioCell(scoreOf(janux?.ops[op]), scoreOf(react?.ops[op]));

		lines.push(`| ${op} | ${cells.join(' | ')} | ${ratio} |`);
	});
	if (result.failed) lines.push('', `> ⚠ gate failures: ${result.failed}`);

	return lines.join('\n');
}

export function renderReport(results) {
	const body = results.map(renderSuite).join('\n\n');

	return `## Benchmark position report\n\n${body}\n`;
}

function loadResults(names) {
	const files = fs
		.readdirSync(RESULTS_DIR)
		.filter((file) => file.endsWith('.json') && !file.startsWith('_tmp'))
		.filter((file) => names.length === 0 || names.includes(file.replace(/\.json$/, '')))
		.sort();

	return files.map((file) => JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, file), 'utf8')));
}

const invokedDirectly = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (invokedDirectly) {
	const names = process.argv.slice(2);

	console.log(renderReport(loadResults(names)));
}
