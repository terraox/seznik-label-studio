import assert from 'node:assert/strict';

import { buildLabelSizeScaleJob } from '@/lib/printer/td404-label-size';

const job = buildLabelSizeScaleJob(50);
const lines = job.split('\r\n');
assert.equal(lines[0], 'GAPDETECT');
assert.ok(!lines.some((l) => /^SIZE /.test(l)), 'SIZE would override the calibration');
assert.ok(lines.includes('BAR 16,0,60,2'), 'ten-mm tick at 0');
assert.ok(lines.includes('BAR 16,600,60,2'), 'ten-mm tick at 50 mm = 600 dots');
assert.ok(lines.includes('TEXT 84,590,"2",0,1,1,"50"'));
assert.ok(!lines.some((l) => l.startsWith('TEXT') && l.includes('"0"')), 'no label at 0');
assert.equal(lines.filter((l) => l.startsWith('BAR 16,') && l.endsWith(',2') && !l.startsWith('BAR 16,0,2,')).length, 51);
assert.equal(lines[lines.length - 2], 'PRINT 1,1');
console.log('td404-label-size ok');
