/**
 * Printer diagnostics: connection snapshot, last print timing, and debug actions.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { SettingsStackHeader } from '@/components/settings-stack-header';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { accentStrong, cardShadow, Palette } from '@/constants/ui';
import {
  getPrinterManager,
  type DiagnosticInfo,
  type PrintTimingEntry,
} from '@/lib/printer/printer-manager';
import { encodeTscTextSample } from '@/lib/printer/tsc';
import { usePrinterStore } from '@/stores/printer-store';

const RAW_TRANSPORTS = new Set(['td404-spp', 'wifi', 'ble', 'bluetooth-spp']);

function statusLook(state: string): { label: string; color: string; bg: string } {
  if (state === 'connected') return { label: 'Connected', color: '#18794A', bg: '#E8F6EE' };
  if (state === 'printing') return { label: 'Printing', color: '#0E7C8A', bg: '#E6F6F8' };
  if (state === 'connecting' || state === 'reconnecting') {
    return { label: 'Connecting', color: '#B45309', bg: '#FEF3C7' };
  }
  if (state === 'error') return { label: 'Error', color: '#DC2626', bg: '#FEE2E2' };
  return { label: 'Not connected', color: '#9A3412', bg: '#FFF7ED' };
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
  return (
    <View style={styles.diagRow}>
      <Text style={styles.diagLabel}>{label}</Text>
      <Text style={[styles.diagValue, mono && styles.mono]} numberOfLines={3}>
        {value}
      </Text>
    </View>
  );
}

function TimingBar({ entry, maxMs }: { entry: PrintTimingEntry; maxMs: number }) {
  const pct = maxMs > 0 ? Math.min(100, (entry.durationMs / maxMs) * 100) : 0;
  return (
    <View style={styles.timingRow}>
      <Text style={styles.timingLabel} numberOfLines={1}>
        {entry.stage}
      </Text>
      <View style={styles.timingBarBg}>
        <View style={[styles.timingBarFill, { width: `${Math.max(pct, 2)}%` }]} />
      </View>
      <Text style={styles.timingMs}>{entry.durationMs} ms</Text>
    </View>
  );
}

export default function PrinterDiagnosticsScreen() {
  const insets = useSafeAreaInsets();
  const status = usePrinterStore((s) => s.status);
  const [diag, setDiag] = useState<DiagnosticInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const log = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLogs((prev) => [`${ts}  ${msg}`, ...prev].slice(0, 200));
  }, []);

  const refresh = useCallback(() => {
    setDiag(getPrinterManager().getDiagnostics());
  }, []);

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
      await getPrinterManager().printTestLabel('Sez Print Diagnostics');
      log(`Test label sent in ${Date.now() - t0} ms.`);
    } catch (error) {
      fail('Test print failed', error);
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const handleSmallPayload = async () => {
    setBusy('small');
    try {
      const transport = getPrinterManager().getDiagnostics().activeTransport;
      const t0 = Date.now();
      if (transport && RAW_TRANSPORTS.has(transport)) {
        log('Sending a small TSPL label…');
        const bytes = encodeTscTextSample({ text: 'DIAG', widthMm: 30, heightMm: 15 });
        await getPrinterManager().print(bytes);
        log(`Small label sent in ${Date.now() - t0} ms (${bytes.length} bytes).`);
      } else {
        log('This printer uses its own language. Sending a short test label instead.');
        await getPrinterManager().printTestLabel('DIAG');
        log(`Test label sent in ${Date.now() - t0} ms.`);
      }
    } catch (error) {
      fail('Small label failed', error);
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
  const timingEntries = diag?.lastPrintTimingMs ?? [];
  const maxTimingMs = timingEntries.reduce((m, e) => Math.max(m, e.durationMs), 1);
  const totalTimingMs = timingEntries.reduce((s, e) => s + e.durationMs, 0);

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
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Connection</Text>
            <DiagRow label="Link" value={look.label} />
            <DiagRow label="Transport" value={prettyTransport(diag?.activeTransport)} />
            <DiagRow label="Device" value={diag?.deviceName ?? 'None'} />
            <DiagRow label="Address" value={diag?.deviceId ?? 'None'} mono />
            <DiagRow label="App status" value={status} />
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

          {timingEntries.length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Last print · {totalTimingMs} ms</Text>
              {timingEntries.map((entry, i) => (
                <TimingBar key={`${entry.stage}-${i}`} entry={entry} maxMs={maxTimingMs} />
              ))}
            </View>
          ) : null}

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
              label="Send a small label"
              icon="doc.text"
              busy={busy === 'small'}
              disabled={busy !== null || !linked}
              onPress={() => void handleSmallPayload()}
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
        <ActivityIndicator size="small" color={danger ? '#DC2626' : accentStrong} />
      ) : (
        <AppIcon name={icon} tintColor={disabled ? Palette.disabled : danger ? '#DC2626' : accentStrong} size={18} />
      )}
      <Text style={[styles.actionBtnText, danger && styles.actionBtnTextDanger, disabled && styles.actionBtnTextDisabled]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.screen, alignItems: 'center' },
  scroll: { flex: 1, width: '100%' },
  content: {
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
  },
  inner: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.three },
  hero: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: Spacing.four,
    alignItems: 'center',
    gap: 6,
    ...cardShadow,
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
  deviceName: { fontSize: 20, fontWeight: '700', color: Palette.ink, textAlign: 'center' },
  deviceMeta: { fontSize: 14, color: Palette.muted, textAlign: 'center' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: Spacing.three,
    gap: 8,
    ...cardShadow,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Palette.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  diagRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#EAECEF',
  },
  diagLabel: { fontSize: 14, color: Palette.muted, flex: 0.9 },
  diagValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Palette.ink,
    flex: 1.2,
    textAlign: 'right',
  },
  mono: { fontFamily: 'monospace', fontSize: 12 },
  timingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  timingLabel: { fontSize: 13, color: Palette.muted, width: 108 },
  timingBarBg: {
    flex: 1,
    height: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 4,
    overflow: 'hidden',
  },
  timingBarFill: { height: '100%', backgroundColor: accentStrong, borderRadius: 4 },
  timingMs: { fontSize: 12, fontWeight: '700', color: Palette.ink, width: 58, textAlign: 'right' },
  actionBtn: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
  },
  actionBtnDanger: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  actionBtnDisabled: { opacity: 0.45 },
  actionBtnText: { fontSize: 15, fontWeight: '700', color: Palette.ink },
  actionBtnTextDanger: { color: '#DC2626' },
  actionBtnTextDisabled: { color: Palette.muted },
  logHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  clear: { color: accentStrong, fontSize: 14, fontWeight: '700' },
  clearDisabled: { color: Palette.disabled },
  logBox: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  emptyLog: { color: '#94A3B8', fontSize: 13, lineHeight: 18 },
  logLine: { fontFamily: 'monospace', fontSize: 12, color: '#E2E8F0', lineHeight: 18 },
  pressed: { opacity: 0.7 },
});
