import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Mirrored from src/constants/ui.ts (that file imports react-native, so node:test
 * cannot load it). Keep these in sync when HomeStatusColors changes.
 */
const HomeStatusColors = {
  idle: '#DC2626',
  busy: '#B45309',
  ok: '#18794A',
  error: '#DC2626',
} as const;

function relativeLuminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const channels = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastOnWhite(bg: string): number {
  return 1.05 / (relativeLuminance(bg) + 0.05);
}

test('HomeStatusColors: idle is red not-connected, ok is green', () => {
  assert.equal(HomeStatusColors.idle, '#DC2626');
  assert.equal(HomeStatusColors.ok, '#18794A');
  assert.equal(HomeStatusColors.busy, '#B45309');
  // Idle must not be the old neutral gray.
  assert.notEqual(HomeStatusColors.idle, '#A4B0BC');
  // Ok must not be the old light green that failed white-text contrast.
  assert.notEqual(HomeStatusColors.ok, '#34C77B');
});

test('HomeStatusColors: white text contrast is at least 4.5:1 on red and green', () => {
  assert.ok(contrastOnWhite(HomeStatusColors.idle) >= 4.5, `idle ${contrastOnWhite(HomeStatusColors.idle)}`);
  assert.ok(contrastOnWhite(HomeStatusColors.ok) >= 4.5, `ok ${contrastOnWhite(HomeStatusColors.ok)}`);
  assert.ok(contrastOnWhite(HomeStatusColors.busy) >= 4.5, `busy ${contrastOnWhite(HomeStatusColors.busy)}`);
});
