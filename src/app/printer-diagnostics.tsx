/**
 * Printer diagnostics: connection snapshot and debug actions.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { PrinterBatteryLabel } from '@/components/printers/printer-battery-label';
import { SettingsStackHeader } from '@/components/settings-stack-header';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { printerReportsBattery } from '@/lib/printer/printer-battery';
import { getPrinterManager, type DiagnosticInfo } from '@/lib/printer/printer-manager';
import { GRID_SPACING_PRESETS_MM } from '@/lib/editor/canvas-grid';
import {
  DIAGNOSTIC_GRID_SIZE_PRESETS,
  parseGridSpacingMm,
  parseLabelSizeMm,
  printDiagnosticGridTest,
  printDiagnosticRulerTest,
  suggestedDiagnosticGridSpacingMm,
} from '@/lib/printer/diagnostic-grid-print';
import { usePrinterStore } from '@/stores/printer-store';
import { C, cardElevation, themedStyles, useThemeRefresh } from '@/theme';

function statusLook(state: string): { label: string; color: string; bg: string } {
  if (state === 'connected') return { label: 'Connected', color: C.success, bg: C.successSoft };
  if (state === 'printing') return { label: 'Printing', color: C.accentInk, bg: C.accentSoft };
  if (state === 'error') return { label: 'Error', color: C.danger, bg: C.dangerSoft };
  return { label: 'Not connected', color: C.warning, bg: C.warningSoft };
}

function prettyTransport(value: string | null | undefined): string {
  switch (value) {
    case 'td404-spp':
      return 'Bluetooth (TSPL)';
    case 'josh-lpapi':
      return 'Bluetooth (Josh)';
    case 'tez-spp':
      return 'Bluetooth (Tez)';
    case 'dev-spp':
      return 'Bluetooth (Dev)';
    case 'labelx-spp':
      return 'Bluetooth (LabelX)';
    case 'ble':
      return 'Bluetooth LE';
    case 'wifi':
      return 'Wi-Fi';
    case 'bluetooth-spp':
      return 'Bluetooth';
    default:
      return value && value !== 'none' ? value : 'None';
  }
}

function DiagRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  useThemeRefresh();
  return (
    <View style={styles.diagRow}>
      <Text style={styles.diagLabel}>{label}</Text>
      <Text style={[styles.diagValue, mono && styles.mono]} numberOfLines={3}>
        {value}
      </Text>
    </View>
  );
}

export default function PrinterDiagnosticsScreen() {
  useThemeRefresh();
  const insets = useSafeAreaInsets();
  const status = usePrinterStore((s) => s.status);
  const batteryPercent = usePrinterStore((s) => s.batteryPercent);
  const sdkId = usePrinterStore((s) => s.sdkId);
  const transport = usePrinterStore((s) => s.transport);
  const showBattery = printerReportsBattery({ sdkId, transport });
  const [diag, setDiag] = useState<DiagnosticInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [gridPresetId, setGridPresetId] = useState(DIAGNOSTIC_GRID_SIZE_PRESETS[0].id);
  const [labelWidthMm, setLabelWidthMm] = useState(String(DIAGNOSTIC_GRID_SIZE_PRESETS[0].widthMm));
  const [labelHeightMm, setLabelHeightMm] = useState(String(DIAGNOSTIC_GRID_SIZE_PRESETS[0].heightMm));
  const [gridSpacingMm, setGridSpacingMm] = useState(
    String(suggestedDiagnosticGridSpacingMm(DIAGNOSTIC_GRID_SIZE_PRESETS[0].widthMm, DIAGNOSTIC_GRID_SIZE_PRESETS[0].heightMm)),
  );
  const [gridTestOpen, setGridTestOpen] = useState(false);

  const gridPreset = useMemo(
    () => DIAGNOSTIC_GRID_SIZE_PRESETS.find((p) => p.id === gridPresetId) ?? DIAGNOSTIC_GRID_SIZE_PRESETS[0],
    [gridPresetId],
  );

  const selectGridPreset = (id: string) => {
    const preset = DIAGNOSTIC_GRID_SIZE_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setGridPresetId(id);
    if (id !== 'custom') {
      setLabelWidthMm(String(preset.widthMm));
      setLabelHeightMm(String(preset.heightMm));
      setGridSpacingMm(String(suggestedDiagnosticGridSpacingMm(preset.widthMm, preset.heightMm)));
    }
  };

  const log = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLogs((prev) => [`${ts}  ${msg}`, ...prev].slice(0, 200));
  }, []);

  const refresh = useCallback(() => {
    setDiag(getPrinterManager().getDiagnostics());
    const linked =
      usePrinterStore.getState().status === 'connected' ||
      usePrinterStore.getState().status === 'printing' ||
      getPrinterManager().isConnectionHealthy();
    if (linked) void getPrinterManager().refreshBattery();
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
      if (
        usePrinterStore.getState().status === 'connected' ||
        usePrinterStore.getState().status === 'printing'
      ) {
        void getPrinterManager().refreshBattery({ force: true });
      }
    }, [refresh]),
  );

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [refresh, status]);

  const fail = (title: string, error: unknown) => {
    const msg = error instanceof Error ? error.message : String(error);
    log(`Failed: ${msg}`);
    Alert.alert(title, msg);
  };

  const handleTestConnection = async () => {
    setBusy('test-conn');
    try {
      log('Checking the connection…');
      const healthy = getPrinterManager().isConnectionHealthy();
      if (healthy) {
        log('Connection is healthy.');
        return;
      }
      log('Connection is down. Trying to restore it…');
      const result = await getPrinterManager().ensureConnected();
      log(result.alreadyConnected ? 'Already connected.' : `Reconnected in ${result.reconnectMs} ms.`);
    } catch (error) {
      fail('Connection test failed', error);
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const handleTestPrint = async () => {
    setBusy('test-print');
    try {
      log('Sending a test label…');
      const t0 = Date.now();
      await getPrinterManager().printDiagnosticTestLabel();
      log(`Test label sent in ${Date.now() - t0} ms.`);
    } catch (error) {
      fail('Test print failed', error);
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const runPatternPrint = async (kind: 'grid' | 'ruler', busyKey: 'grid' | 'ruler') => {
    const parsed = parseLabelSizeMm(labelWidthMm, labelHeightMm);
    if ('error' in parsed) {
      Alert.alert('Label size', parsed.error);
      return;
    }
    let gridSpacing = 5;
    if (kind === 'grid') {
      const spacingParsed = parseGridSpacingMm(gridSpacingMm);
      if ('error' in spacingParsed) {
        Alert.alert('Grid spacing', spacingParsed.error);
        return;
      }
      gridSpacing = spacingParsed.spacingMm;
    }

    setBusy(busyKey);
    try {
      const label = kind === 'grid' ? 'grid' : 'scale ruler';
      log(
        kind === 'grid'
          ? `Printing ${label} at ${parsed.widthMm}×${parsed.heightMm} mm, ${gridSpacing} mm spacing…`
          : `Printing ${label} at ${parsed.widthMm}×${parsed.heightMm} mm…`,
      );
      const t0 = Date.now();
      if (kind === 'grid') {
        await printDiagnosticGridTest(parsed.widthMm, parsed.heightMm, gridSpacing);
      } else {
        await printDiagnosticRulerTest(parsed.widthMm, parsed.heightMm);
      }
      log(`${label} sent in ${Date.now() - t0} ms.`);
    } catch (error) {
      fail(kind === 'grid' ? 'Grid test failed' : 'Scale test failed', error);
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const handleConnect = async () => {
    setBusy('connect');
    try {
      if (!usePrinterStore.getState().lastDeviceId && !getPrinterManager().isConnectionHealthy()) {
        log('No saved printer. Connect one from the printer screen first.');
        Alert.alert('No saved printer', 'Connect a printer from the Connect printer screen, then try again.');
        return;
      }
      log('Reconnecting to the last printer…');
      const t0 = Date.now();
      const ok = await getPrinterManager().reconnectLastDevice();
      const elapsed = Date.now() - t0;
      if (ok) {
        log(`Connected in ${elapsed} ms.`);
      } else {
        const reason = getPrinterManager().getDiagnostics().lastError;
        const msg = reason || `Could not reconnect (${elapsed} ms).`;
        log(`Failed: ${msg}`);
        Alert.alert('Reconnect failed', msg);
      }
    } catch (error) {
      fail('Reconnect failed', error);
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const handleDisconnect = async () => {
    setBusy('disconnect');
    try {
      log('Disconnecting…');
      getPrinterManager().suppressAutoReconnect();
      await getPrinterManager().disconnect();
      log('Disconnected.');
    } catch (error) {
      fail('Disconnect failed', error);
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const connectionState = diag?.connectionState ?? 'disconnected';
  const look = statusLook(connectionState);
  const linked = connectionState === 'connected' || connectionState === 'printing';
  const showBle = diag?.activeTransport === 'ble' || Boolean(diag?.bleServiceUuid);

  return (
    <View style={styles.root}>
      <SettingsStackHeader title="Diagnostics" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.four }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.inner}>
          <View style={styles.hero}>
            <View style={[styles.pill, { backgroundColor: look.bg }]}>
              <View style={[styles.dot, { backgroundColor: look.color }]} />
              <Text style={[styles.pillText, { color: look.color }]}>{look.label}</Text>
            </View>
            <Text style={styles.deviceName}>{diag?.deviceName || diag?.deviceId || 'No printer selected'}</Text>
            <Text style={styles.deviceMeta}>{prettyTransport(diag?.activeTransport)}</Text>
            {linked && showBattery ? (
              <View style={styles.heroBattery}>
                <Text style={styles.heroBatteryLabel}>Battery</Text>
                <PrinterBatteryLabel
                  percent={batteryPercent}
                  size={20}
                  showWhenUnknown
                  unknownText="Not reported"
                />
              </View>
            ) : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Connection</Text>
            <DiagRow label="Link" value={look.label} />
            <DiagRow label="Transport" value={prettyTransport(diag?.activeTransport)} />
            <DiagRow label="Device" value={diag?.deviceName ?? 'None'} />
            <DiagRow label="Address" value={diag?.deviceId ?? 'None'} mono />
            <DiagRow label="App status" value={status} />
            {showBattery ? (
              <DiagRow
                label="Battery"
                value={batteryPercent != null ? `${batteryPercent}%` : linked ? 'Not reported' : 'N/A'}
              />
            ) : null}
          </View>

          {showBle ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Bluetooth LE</Text>
              <DiagRow label="MTU" value={diag?.bleNegotiatedMtu ? String(diag.bleNegotiatedMtu) : 'Not negotiated'} />
              <DiagRow label="Chunk size" value={diag?.bleChunkSize ? `${diag.bleChunkSize} bytes` : 'Unknown'} />
              <DiagRow label="Service" value={diag?.bleServiceUuid ?? 'Unknown'} mono />
              <DiagRow label="Characteristic" value={diag?.bleCharacteristicUuid ?? 'Unknown'} mono />
              <DiagRow
                label="Write mode"
                value={
                  diag?.bleWriteWithResponse == null
                    ? 'Unknown'
                    : diag.bleWriteWithResponse
                      ? 'With response'
                      : 'Without response'
                }
              />
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Print queue</Text>
            <DiagRow label="Waiting jobs" value={String(diag?.printQueueLength ?? 0)} />
            <DiagRow label="Last retry" value={String(diag?.retryCount ?? 0)} />
            <DiagRow label="Last error" value={diag?.lastError?.trim() ? diag.lastError : 'None'} />
          </View>

          <View style={styles.card}>
            <Pressable
              onPress={() => setGridTestOpen((open) => !open)}
              style={({ pressed }) => [styles.expandHeader, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityState={{ expanded: gridTestOpen }}>
              <Text style={styles.sectionTitle}>Grid test label</Text>
              <AppIcon
                name={gridTestOpen ? 'arrowtriangle.up.fill' : 'arrowtriangle.down.fill'}
                tintColor={C.textMuted}
                size={14}
              />
            </Pressable>
            {gridTestOpen ? (
              <>
                <Text style={styles.help}>
                  Choose label size, then print either a grid or an mm scale ruler — not both, and no label
                  border.
                </Text>
                <Text style={styles.fieldLabel}>Label size</Text>
                <View style={styles.presetWrap}>
                  {DIAGNOSTIC_GRID_SIZE_PRESETS.map((preset) => {
                    const selected = preset.id === gridPresetId;
                    return (
                      <Pressable
                        key={preset.id}
                        onPress={() => selectGridPreset(preset.id)}
                        style={({ pressed }) => [
                          styles.presetChip,
                          selected && styles.presetChipOn,
                          pressed && styles.pressed,
                        ]}>
                        <Text style={[styles.presetChipText, selected && styles.presetChipTextOn]}>
                          {preset.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={styles.mmRow}>
                  <View style={styles.mmField}>
                    <Text style={styles.fieldLabel}>Width (mm)</Text>
                    <TextInput
                      value={labelWidthMm}
                      onChangeText={(v) => {
                        setGridPresetId('custom');
                        setLabelWidthMm(v);
                      }}
                      keyboardType="decimal-pad"
                      style={styles.mmInput}
                      placeholder="50"
                    />
                  </View>
                  <View style={styles.mmField}>
                    <Text style={styles.fieldLabel}>Height (mm)</Text>
                    <TextInput
                      value={labelHeightMm}
                      onChangeText={(v) => {
                        setGridPresetId('custom');
                        setLabelHeightMm(v);
                      }}
                      keyboardType="decimal-pad"
                      style={styles.mmInput}
                      placeholder="15"
                    />
                  </View>
                </View>
                <Text style={styles.sizeHint}>
                  Active: {labelWidthMm || '—'} × {labelHeightMm || '—'} mm
                  {gridPreset.id !== 'custom' ? ` (${gridPreset.label})` : ''}
                </Text>
                <Text style={styles.fieldLabel}>Grid spacing (mm)</Text>
                <View style={styles.presetWrap}>
                  {GRID_SPACING_PRESETS_MM.map((mm) => {
                    const selected = gridSpacingMm === String(mm);
                    return (
                      <Pressable
                        key={mm}
                        onPress={() => setGridSpacingMm(String(mm))}
                        style={({ pressed }) => [
                          styles.presetChip,
                          selected && styles.presetChipOn,
                          pressed && styles.pressed,
                        ]}>
                        <Text style={[styles.presetChipText, selected && styles.presetChipTextOn]}>
                          {mm} mm
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={styles.mmField}>
                  <Text style={styles.fieldLabel}>Custom spacing (0.5–20 mm)</Text>
                  <TextInput
                    value={gridSpacingMm}
                    onChangeText={setGridSpacingMm}
                    keyboardType="decimal-pad"
                    style={styles.mmInput}
                    placeholder="5"
                  />
                </View>
                <ActionButton
                  label="Print grid test"
                  icon="square.grid.3x3"
                  busy={busy === 'grid'}
                  disabled={busy !== null || !linked}
                  onPress={() => void runPatternPrint('grid', 'grid')}
                />
                <ActionButton
                  label="Print scale (mm ruler)"
                  icon="list.number"
                  busy={busy === 'ruler'}
                  disabled={busy !== null || !linked}
                  onPress={() => void runPatternPrint('ruler', 'ruler')}
                />
              </>
            ) : (
              <Text style={styles.collapsedHint}>
                Tap to set label size, grid spacing, and print grid or scale tests.
              </Text>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Actions</Text>
            <ActionButton
              label="Reconnect last printer"
              icon="link"
              busy={busy === 'connect'}
              disabled={busy !== null || linked}
              onPress={() => void handleConnect()}
            />
            <ActionButton
              label="Check connection"
              icon="arrow.clockwise"
              busy={busy === 'test-conn'}
              disabled={busy !== null}
              onPress={() => void handleTestConnection()}
            />
            <ActionButton
              label="Print a test label"
              icon="printer"
              busy={busy === 'test-print'}
              disabled={busy !== null || !linked}
              onPress={() => void handleTestPrint()}
            />
            <ActionButton
              label="Disconnect"
              icon="xmark"
              busy={busy === 'disconnect'}
              disabled={busy !== null || !linked}
              onPress={() => void handleDisconnect()}
              danger
            />
          </View>

          <View style={styles.card}>
            <View style={styles.logHeader}>
              <Text style={styles.sectionTitle}>Activity</Text>
              <Pressable
                onPress={() => setLogs([])}
                disabled={logs.length === 0}
                hitSlop={8}
                style={({ pressed }) => pressed && styles.pressed}>
                <Text style={[styles.clear, logs.length === 0 && styles.clearDisabled]}>Clear</Text>
              </Pressable>
            </View>
            <View style={styles.logBox}>
              {logs.length === 0 ? (
                <Text style={styles.emptyLog}>Actions you run will show up here.</Text>
              ) : (
                logs.map((line, i) => (
                  <Text key={`${line}-${i}`} style={styles.logLine}>
                    {line}
                  </Text>
                ))
              )}
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function ActionButton({
  label,
  icon,
  busy,
  disabled,
  onPress,
  danger,
}: {
  label: string;
  icon: string;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
  danger?: boolean;
}) {
  useThemeRefresh();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.actionBtn,
        danger && styles.actionBtnDanger,
        disabled && styles.actionBtnDisabled,
        pressed && !disabled && styles.pressed,
      ]}>
      {busy ? (
        <ActivityIndicator size="small" color={danger ? C.danger : C.accentInk} />
      ) : (
        <AppIcon name={icon} tintColor={disabled ? C.textDisabled : danger ? C.danger : C.accentInk} size={18} />
      )}
      <Text style={[styles.actionBtnText, danger && styles.actionBtnTextDanger, disabled && styles.actionBtnTextDisabled]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = themedStyles((c, scheme) => ({
  root: { flex: 1, backgroundColor: c.bg, alignItems: 'center' },
  scroll: { flex: 1, width: '100%' },
  content: {
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
  },
  inner: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.three },
  hero: {
    backgroundColor: c.surface,
    borderRadius: 16,
    padding: Spacing.four,
    alignItems: 'center',
    gap: 6,
    ...cardElevation(c, scheme),
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { fontSize: 13, fontWeight: '700' },
  deviceName: { fontSize: 20, fontWeight: '700', color: c.text, textAlign: 'center' },
  deviceMeta: { fontSize: 14, color: c.textMuted, textAlign: 'center' },
  heroBattery: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.hairline,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  heroBatteryLabel: { fontSize: 14, fontWeight: '600', color: c.textMuted },
  card: {
    backgroundColor: c.surface,
    borderRadius: 16,
    padding: Spacing.three,
    gap: 8,
    ...cardElevation(c, scheme),
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: c.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  expandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  collapsedHint: { fontSize: 13, lineHeight: 18, color: c.textMuted },
  help: { fontSize: 13, lineHeight: 19, color: c.textMuted },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: c.textMuted, marginTop: 4 },
  presetWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.hairline,
    backgroundColor: c.fill,
  },
  presetChipOn: { borderColor: c.accentInk, backgroundColor: c.accentSoft },
  presetChipText: { fontSize: 13, fontWeight: '600', color: c.text },
  presetChipTextOn: { color: c.accentInk },
  mmRow: { flexDirection: 'row', gap: 12 },
  mmField: { flex: 1, gap: 4 },
  mmInput: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.hairline,
    backgroundColor: c.surface,
    paddingHorizontal: 12,
    fontSize: 16,
    fontWeight: '600',
    color: c.text,
  },
  sizeHint: { fontSize: 12, color: c.textMuted },
  diagRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.hairline,
  },
  diagLabel: { fontSize: 14, color: c.textMuted, flex: 0.9 },
  diagValue: {
    fontSize: 14,
    fontWeight: '600',
    color: c.text,
    flex: 1.2,
    textAlign: 'right',
  },
  mono: { fontFamily: 'monospace', fontSize: 12 },
  actionBtn: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: c.fill,
    borderWidth: 1,
    borderColor: c.hairline,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
  },
  actionBtnDanger: { backgroundColor: c.dangerSoft, borderColor: c.danger },
  actionBtnDisabled: { opacity: 0.45 },
  actionBtnText: { fontSize: 15, fontWeight: '700', color: c.text },
  actionBtnTextDanger: { color: c.danger },
  actionBtnTextDisabled: { color: c.textMuted },
  logHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  clear: { color: c.accentInk, fontSize: 14, fontWeight: '700' },
  clearDisabled: { color: c.textDisabled },
  logBox: {
    backgroundColor: '#0F172A', // theme-fixed: dark log console in both themes
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  emptyLog: { color: c.textMuted, fontSize: 13, lineHeight: 18 },
  logLine: { fontFamily: 'monospace', fontSize: 12, color: c.textDisabled, lineHeight: 18 },
  pressed: { opacity: 0.7 },
}));
