import assert from 'node:assert/strict';
import test from 'node:test';

import {
  consumerIdFromLegacy,
  consumerMatchesDriver,
  migrateLastDeviceForModel,
  toDriverModel,
} from '@/constants/printer-models';

test('consumer family must match the native driver', () => {
  assert.equal(consumerMatchesDriver('josh', 'josh'), true);
  assert.equal(consumerMatchesDriver('tejas', 'josh'), false);
  assert.equal(consumerMatchesDriver('tejas', 'td404'), true);
  assert.equal(consumerMatchesDriver('rudra', 'td404'), true);
  assert.equal(consumerMatchesDriver('josh', 'td404'), false);
});

test('Tejas and Rudra share the TD-404 driver; Josh uses its own', () => {
  assert.equal(toDriverModel('tejas'), 'td404');
  assert.equal(toDriverModel('rudra'), 'td404');
  assert.equal(toDriverModel('josh'), 'josh');
});

test('legacy saved models land on Tejas unless they were Josh', () => {
  assert.equal(consumerIdFromLegacy('td404'), 'tejas');
  assert.equal(consumerIdFromLegacy('tez'), 'tejas');
  assert.equal(consumerIdFromLegacy('dev'), 'tejas');
  assert.equal(consumerIdFromLegacy('labelx'), 'tejas');
  assert.equal(consumerIdFromLegacy('josh'), 'josh');
  assert.equal(consumerIdFromLegacy('labelx', 'josh'), 'josh');
  assert.equal(consumerIdFromLegacy('rudra'), 'rudra');
  assert.equal(consumerIdFromLegacy('tejas'), 'tejas');
});

test('last-device map keeps Tejas from the old TD-404 key and drops hidden drivers', () => {
  const migrated = migrateLastDeviceForModel({
    td404: { id: 'AA:BB:CC:DD:EE:01', name: 'Tejas' },
    josh: { id: 'AA:BB:CC:DD:EE:02', name: 'Josh' },
    dev: { id: 'AA:BB:CC:DD:EE:03', name: 'Dev' },
    rudra: { id: 'AA:BB:CC:DD:EE:04', name: 'Rudra' },
  });
  assert.deepEqual(migrated.tejas, { id: 'AA:BB:CC:DD:EE:01', name: 'Tejas' });
  assert.deepEqual(migrated.rudra, { id: 'AA:BB:CC:DD:EE:04', name: 'Rudra' });
  assert.deepEqual(migrated.josh, { id: 'AA:BB:CC:DD:EE:02', name: 'Josh' });
  assert.equal('dev' in migrated, false);
});
