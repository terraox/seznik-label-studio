/**
 * Layout risk report (see src/theme/__tests__/layout-risk-scan.ts).
 *   npm run layout:report              every risk, grouped by file
 *   npm run layout:report -- --summary totals per rule and per file only
 *   npm run layout:baseline            rewrite the ratchet baseline from the current code
 */
import { writeFileSync } from 'node:fs';

import {
  BASELINE_PATH,
  countRisks,
  FONT_SCALE_CAP,
  RULES,
  scanAll,
  type RuleId,
} from '../src/theme/__tests__/layout-risk-scan';

const all = scanAll();
const counts = countRisks(all);

if (process.argv.includes('--update')) {
  const sorted = Object.fromEntries(Object.keys(counts).sort().map((f) => [f, counts[f]]));
  writeFileSync(BASELINE_PATH, JSON.stringify(sorted, null, 2) + '\n');
  console.log(`Baseline written: ${Object.keys(sorted).length} files with risks.`);
  process.exit(0);
}

const files = Object.keys(counts).sort(
  (a, b) => all[b].length - all[a].length || a.localeCompare(b),
);
const totals = {} as Record<RuleId, number>;
for (const risks of Object.values(all)) for (const r of risks) totals[r.rule] = (totals[r.rule] ?? 0) + 1;

console.log(`Layout risks (${Object.keys(all).length} files scanned, text checked at font ×${FONT_SCALE_CAP})\n`);
for (const rule of Object.keys(RULES) as RuleId[]) {
  console.log(`  ${String(totals[rule] ?? 0).padStart(4)}  ${rule}: ${RULES[rule]}`);
}
console.log(`\n${files.length} files\n`);

const summary = process.argv.includes('--summary');
for (const file of files) {
  console.log(`${String(all[file].length).padStart(4)}  ${file}`);
  if (summary) continue;
  for (const r of all[file]) console.log(`        ${r.line}: ${r.rule}  ${r.text}`);
}
