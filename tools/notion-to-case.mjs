#!/usr/bin/env node
// Turn a Notion page (properties + markdown body) into a case JSON file.
//
//   node tools/notion-to-case.mjs <bundle.json> [outDir]
//
// The bundle is what the scheduled sync task writes out of Notion:
//   { "meta": { "caseId","title","subtitle","client","opponent",
//               "level","order","moneyThreshold" },
//     "markdown": "## Fact Pattern\n..." }
//
// Writes <outDir>/<caseId>.json and prints a one-line summary. Any format
// problem exits non-zero WITHOUT writing, so a malformed Notion edit can
// never corrupt a working case file.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { markdownToCase } from './notionCaseFormat.mjs';

const [, , bundleFile, outDirArg] = process.argv;
if (!bundleFile) {
  console.error('usage: node tools/notion-to-case.mjs <bundle.json> [outDir]');
  process.exit(1);
}
const outDir = resolve(outDirArg || 'src/data/cases');

try {
  const bundle = JSON.parse(readFileSync(bundleFile, 'utf8'));
  const caseData = markdownToCase(bundle.markdown, bundle.meta);
  const value = caseData.documentPool.reduce(
    (s, d) => s + d.hotZones.reduce((t, z) => t + z.value, 0),
    0
  );
  mkdirSync(outDir, { recursive: true });
  const target = join(outDir, `${caseData.id}.json`);
  writeFileSync(target, `${JSON.stringify(caseData, null, 2)}\n`, 'utf8');
  console.log(
    `ok ${caseData.id}: ${caseData.documentPool.length} documents, $${value} on the table -> ${target}`
  );
} catch (err) {
  console.error(`FAILED (${bundleFile}): ${err.message}`);
  console.error('Nothing was written. Fix the Notion page and re-run.');
  process.exit(1);
}
