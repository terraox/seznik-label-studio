#!/usr/bin/env node
// Fails when docs/database.dbml has drifted from prisma/schema.prisma:
//   - a Prisma model (table) or stored column missing from the diagram
//   - a diagram table that is neither a Prisma model nor marked [FILE]
import { readFileSync } from 'node:fs';

const prisma = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
const dbml = readFileSync(new URL('../docs/database.dbml', import.meta.url), 'utf8');

const modelNames = [...prisma.matchAll(/^model (\w+) \{/gm)].map((m) => m[1]);
const enumNames = [...prisma.matchAll(/^enum (\w+) \{/gm)].map((m) => m[1]);

const models = {};
for (const m of prisma.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
  const map = /@@map\("(\w+)"\)/.exec(m[2]);
  const columns = [];
  for (const line of m[2].split('\n')) {
    const f = /^\s{2}(\w+)\s+([\w]+)(\[\])?(\?)?/.exec(line);
    if (!f || line.trim().startsWith('//') || line.trim().startsWith('@@')) continue;
    const [, name, type, list] = f;
    if (list || modelNames.includes(type)) continue; // relation, not a column
    columns.push(name);
  }
  models[map ? map[1] : m[1]] = columns;
}

const tables = {};
for (const t of dbml.matchAll(/^Table (\w+) \{([\s\S]*?)^\}/gm)) tables[t[1]] = t[2];
const dbmlEnums = [...dbml.matchAll(/^Enum (\w+) \{/gm)].map((m) => m[1]);

const problems = [];
for (const [table, columns] of Object.entries(models)) {
  const body = tables[table];
  if (!body) {
    problems.push(`table ${table} is missing from database.dbml`);
    continue;
  }
  for (const column of columns) {
    if (!new RegExp(`^\\s{2}${column}\\s`, 'm').test(body)) problems.push(`${table}.${column} is missing from database.dbml`);
  }
}
for (const [table, body] of Object.entries(tables)) {
  if (!models[table] && !body.includes('[FILE]')) problems.push(`database.dbml table ${table} is not in schema.prisma (mark it [FILE] if intended)`);
}
for (const e of enumNames) if (!dbmlEnums.includes(e)) problems.push(`enum ${e} is missing from database.dbml`);

if (problems.length) {
  console.error('DBML is out of date:\n  - ' + problems.join('\n  - '));
  process.exit(1);
}
console.log(`dbml ok: ${Object.keys(models).length} tables, ${Object.values(models).flat().length} columns, ${enumNames.length} enums in step with prisma/schema.prisma`);
