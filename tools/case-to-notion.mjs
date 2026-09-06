#!/usr/bin/env node
// Print the Notion page body for a case JSON file.
//   node tools/case-to-notion.mjs src/data/cases/case-01.json
import { readFileSync } from 'node:fs';
import { caseToMarkdown } from './notionCaseFormat.mjs';

const file = process.argv[2];
if (!file) {
  console.error('usage: node tools/case-to-notion.mjs <case.json>');
  process.exit(1);
}
process.stdout.write(caseToMarkdown(JSON.parse(readFileSync(file, 'utf8'))));
