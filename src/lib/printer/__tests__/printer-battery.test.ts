import assert from 'node:assert/strict';

import { normalizeBatteryPercent } from '@/lib/printer/battery-percent';

assert.equal(normalizeBatteryPercent(72), 72);
assert.equal(normalizeBatteryPercent(0), 0);
assert.equal(normalizeBatteryPercent(100.4), 100);
assert.equal(normalizeBatteryPercent(-1), null);
assert.equal(normalizeBatteryPercent(255), null);
assert.equal(normalizeBatteryPercent('bad'), null);

console.log('ok printer-battery');
