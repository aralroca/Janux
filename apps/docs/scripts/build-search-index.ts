/** Serializes the search corpus to public/search-index.json for the ⌘K modal. */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { searchCorpus } from '../src/server/docs.api';

const OUT = join(import.meta.dirname, '../public/search-index.json');
const corpus = searchCorpus();

writeFileSync(OUT, JSON.stringify(corpus));
console.log(`search-index.json: ${corpus.length} pages`);
