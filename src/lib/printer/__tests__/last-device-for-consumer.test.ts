import assert from 'node:assert/strict';
import { test } from 'node:test';

import { lastDeviceForConsumer } from '@/lib/printer/printer-bridge';

const TEJAS = { id: 'AA:AA:AA:AA:AA:01', name: 'B15-1234' };
const RUDRA = { id: 'AA:AA:AA:AA:AA:02', name: 'B17-5678' };
const JOSH = { id: 'AA:AA:AA:AA:AA:03', name: 'LD0801-9' };

test('Rudra does not show the Tejas that last used the shared bridge', () => {
  const state = {
    lastDeviceForModel: { tejas: TEJAS },
    lastDeviceForBridge: { 'bluetooth-spp': { ...TEJAS, consumer: 'tejas' as const, connectedAt: 1 } },
  };
  assert.equal(lastDeviceForConsumer(state, 'rudra'), null);
  assert.equal(lastDeviceForConsumer(state, 'tejas')?.name, 'B15-1234');
});

test('each TD-404 family keeps its own last printer', () => {
  const state = {
    lastDeviceForModel: { tejas: { ...TEJAS, connectedAt: 1 }, rudra: { ...RUDRA, connectedAt: 2 } },
    lastDeviceForBridge: { 'bluetooth-spp': { ...TEJAS, consumer: 'tejas' as const, connectedAt: 3 } },
  };
  assert.deepEqual(lastDeviceForConsumer(state, 'rudra'), { ...RUDRA, consumer: 'rudra', connectedAt: 2 });
  assert.deepEqual(lastDeviceForConsumer(state, 'tejas'), { ...TEJAS, consumer: 'tejas', connectedAt: 1 });
});

test('older entries without connectedAt take it from the matching bridge entry', () => {
  const state = {
    lastDeviceForModel: { josh: JOSH },
    lastDeviceForBridge: { 'josh-lpapi': { ...JOSH, consumer: 'josh' as const, connectedAt: 5 } },
  };
  assert.equal(lastDeviceForConsumer(state, 'josh')?.connectedAt, 5);
});

test('falls back to the bridge entry only when it is the same family', () => {
  const state = {
    lastDeviceForModel: {},
    lastDeviceForBridge: { 'bluetooth-spp': { ...RUDRA, consumer: 'rudra' as const } },
  };
  assert.equal(lastDeviceForConsumer(state, 'rudra')?.id, RUDRA.id);
  assert.equal(lastDeviceForConsumer(state, 'tejas'), null);
});
