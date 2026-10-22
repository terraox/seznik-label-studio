// Writes web/public/sample.seznik from the same fixtures the tests use: `npm run sample` in web/.
import { writeFileSync } from 'node:fs';
import { buildSezlabel } from '@/lib/label-share/export';
import { FakePhone, fullDocument } from '@/lib/label-share/__tests__/fixtures';

async function main() {
const phone = new FakePhone();
const doc = fullDocument(phone);
doc.name = 'Sample (all 13 types)';
const out = await buildSezlabel(doc, phone.exportEnv());
writeFileSync(`${__dirname}/public/sample.seznik`, out.bytes);
console.log(`sample.seznik ${out.bytes.length} bytes`, out.summary);
}
void main();
