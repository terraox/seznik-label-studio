import assert from 'node:assert/strict';

import { normalizeBatteryPercent, printerReportsBattery } from '@/lib/printer/battery-percent';

assert.equal(normalizeBatteryPercent(72), 72);
assert.equal(normalizeBatteryPercent(0), 0);
assert.equal(normalizeBatteryPercent(100.4), 100);
assert.equal(normalizeBatteryPercent(-1), null);
assert.equal(normalizeBatteryPercent(255), null);
assert.equal(normalizeBatteryPercent('bad'), null);

assert.equal(printerReportsBattery({ sdkId: 'td404' }), false);
assert.equal(printerReportsBattery({ transport: 'td404-spp' }), false);
assert.equal(printerReportsBattery({ sdkId: 'josh' }), true);

console.log('ok printer-battery');
