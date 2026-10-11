import assert from 'node:assert/strict';

import { joshBatteryVoltageToPercent } from '@/lib/printer/josh-battery-percent';

assert.equal(joshBatteryVoltageToPercent(72), 72);
assert.equal(joshBatteryVoltageToPercent(3.7), joshBatteryVoltageToPercent(370));
assert.ok(joshBatteryVoltageToPercent(4.2)! >= 95);
assert.equal(joshBatteryVoltageToPercent(0), null);

console.log('ok josh-battery-percent');
