import assert from 'node:assert/strict';

import { buildLabelSizeCalibrateJob, buildLabelSizeScaleJob } from '@/lib/printer/td404-label-size';

const job = buildLabelSizeScaleJob(50);
const lines = job.split('\r\n');
assert.equal(buildLabelSizeCalibrateJob(), '\r\nGAPDETECT\r\n');
assert.ok(!lines.includes('GAPDETECT'), 'calibration is a separate write');
assert.ok(lines.includes('SIZE 30 mm,52 mm'), 'a job without SIZE is dropped by the firmware');
assert.ok(lines.includes('BAR 16,0,60,2'), 'ten-mm tick at 0');
assert.ok(lines.includes('BAR 16,600,60,2'), 'ten-mm tick at 50 mm = 600 dots');
assert.ok(lines.includes('TEXT 84,590,"2",0,1,1,"50"'));
assert.ok(!lines.some((l) => l.startsWith('TEXT') && l.includes('"0"')), 'no label at 0');
assert.equal(lines.filter((l) => l.startsWith('BAR 16,') && l.endsWith(',2') && !l.startsWith('BAR 16,0,2,')).length, 51);
assert.equal(lines[lines.length - 2], 'PRINT 1');
console.log('td404-label-size ok');
