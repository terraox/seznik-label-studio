import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

test('printer-josh capabilities include ios in source', () => {
  const file = path.join(process.cwd(), 'src', 'printer-josh', 'index.ts');
  const src = fs.readFileSync(file, 'utf8');
  assert.match(src, /platforms:\s*\['android',\s*'ios'\]/);
  assert.match(src, /transports:\s*\['spp',\s*'ble'\]/);
});

test('josh-printer expo-module.config lists ios', () => {
  const file = path.join(process.cwd(), 'modules', 'josh-printer', 'expo-module.config.json');
  const json = JSON.parse(fs.readFileSync(file, 'utf8')) as { platforms: string[]; ios?: unknown };
  assert.ok(json.platforms.includes('ios'));
  assert.ok(json.ios);
});
