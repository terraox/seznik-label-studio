import * as Linking from 'expo-linking';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  BluetoothBlockers,
  BluetoothOffDialog,
  ConnectedActions,
  DeviceList,
  PrinterFamilyCards,
  type DeviceBadge,
} from '@/components/printers/connect';
import { SettingsStackHeader } from '@/components/settings-stack-header';
import {
  CONSUMER_PRINTERS,
  toDriverModel,
  type ConsumerPrinterId,
} from '@/constants/printer-models';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { Palette } from '@/constants/ui';
import { isBluetoothOffError } from '@/lib/printer/bluetooth-guard';
import { getAmbiguousModelCandidates } from '@/lib/printer/printer-heuristics';
import {
  getPrinterManager,
  isLikelyJoshName,
  isLikelyTd404Name,
  type BluetoothCapabilities,
  type DiscoveredPrinter,
} from '@/lib/printer/printer-manager';
import { normalizePrinterMac, usePrinterStore } from '@/stores/printer-store';

const ANDROID_BLUETOOTH_SETTINGS = 'android.settings.BLUETOOTH_SETTINGS';

async function openPhoneBluetoothSettings() {
  try {
    if (Platform.OS === 'android') {
      await Linking.sendIntent(ANDROID_BLUETOOTH_SETTINGS);
      return;
    }
    if (Platform.OS === 'ios') {
      await Linking.openURL('app-settings:');
      return;
    }
    Alert.alert('Unavailable', 'Bluetooth settings can only be opened from the Android or iOS app.');
  } catch (error) {
    try {
      await Linking.openSettings();
    } catch {
      Alert.alert(
        'Could not open settings',
        error instanceof Error ? error.message : 'Open Bluetooth from the phone Settings app, then scan again.',
      );
    }
  }
}

function mergeDevice(existing: DiscoveredPrinter, device: DiscoveredPrinter): DiscoveredPrinter {
  const name = device.name || existing.name;
  const incomingSpecific = device.sdkId && device.sdkId !== 'generic';
  const existingSpecific = existing.sdkId && existing.sdkId !== 'generic';
  const sdkId = incomingSpecific ? device.sdkId : existingSpecific ? existing.sdkId : device.sdkId ?? existing.sdkId;
  return {
    ...existing,
    ...device,
    name,
    sdkId,
    transport: incomingSpecific ? device.transport : existing.transport ?? device.transport,
    likelyJosh: Boolean(device.likelyJosh || existing.likelyJosh || isLikelyJoshName(name)),
    likelyTd404: Boolean(device.likelyTd404 || existing.likelyTd404 || isLikelyTd404Name(name)),
    bonded: Boolean(existing.bonded || device.bonded),
  };
}

function choicesFor(device: DiscoveredPrinter, selected: ConsumerPrinterId): ConsumerPrinterId[] {
  const candidates = getAmbiguousModelCandidates(device.name, device.transport);
  const josh =
    candidates.includes('josh') ||
    device.sdkId === 'josh' ||
    Boolean(device.likelyJosh) ||
    isLikelyJoshName(device.name);
  const td404 =
    candidates.includes('td404') ||
    device.sdkId === 'td404' ||
    Boolean(device.likelyTd404) ||
    isLikelyTd404Name(device.name);
  const out: ConsumerPrinterId[] = [];
  if (josh) out.push('josh');
  if (td404) out.push(selected === 'rudra' ? 'rudra' : 'tejas');
  if (out.length === 0) out.push(selected);
  return [...new Set(out)];
}

/** Only label a row when the Bluetooth name itself says Tejas, Rudra, or Josh. */
function badgeFor(device: DiscoveredPrinter): DeviceBadge | null {
  const name = device.name?.toLowerCase() ?? '';
  const match = name.includes('josh')
    ? CONSUMER_PRINTERS.josh
    : name.includes('rudra')
      ? CONSUMER_PRINTERS.rudra
      : name.includes('tejas')
        ? CONSUMER_PRINTERS.tejas
        : null;
  if (!match) return null;
  return {
    label: match.shortName,
    color: match.accent,
    background: match.accentSoft,
    border: match.accentBorder,
  };
}

export default function PrinterConnectScreen() {
  const insets = useSafeAreaInsets();
  const status = usePrinterStore((s) => s.status);
  const deviceName = usePrinterStore((s) => s.deviceName);
  const selectedModel = usePrinterStore((s) => s.selectedPrinterModel);
  const setSelectedPrinterModel = usePrinterStore((s) => s.setSelectedPrinterModel);

  const printer = CONSUMER_PRINTERS[selectedModel] ?? CONSUMER_PRINTERS.tejas;

  const [devices, setDevices] = useState<DiscoveredPrinter[]>([]);
  const [scanning, setScanning] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [nativeHint, setNativeHint] = useState<string | null>(null);
  const [scanErrors, setScanErrors] = useState<string[]>([]);
  const [caps, setCaps] = useState<BluetoothCapabilities>(() => getPrinterManager().getCapabilities());
  const [bluetoothOn, setBluetoothOn] = useState(() => getPrinterManager().isBluetoothEnabled());
  const [bluetoothOffDialog, setBluetoothOffDialog] = useState(false);
  const mountedRef = useRef(true);

  const refreshCaps = useCallback(() => {
    const mgr = getPrinterManager();
    const nextCaps = mgr.getCapabilities();
    const on = mgr.isBluetoothEnabled();
    setCaps(nextCaps);
    setBluetoothOn(on);
    return { caps: nextCaps, bluetoothOn: on };
  }, []);

  const startScan = useCallback(async (target: ConsumerPrinterId = selectedModel) => {
    if (getPrinterManager().isConnected) return;
    const { caps: nextCaps, bluetoothOn: on } = refreshCaps();
    const meta = CONSUMER_PRINTERS[target];
    if (!nextCaps.canScan) {
      setNativeHint(nextCaps.reason);
      return;
    }
    if (!on) {
      setDevices([]);
      setScanning(false);
      setScanErrors([]);
      setNativeHint(null);
      return;
    }
    setDevices([]);
    setScanning(true);
    setNativeHint(null);
    setScanErrors([]);
    try {
      const result = await getPrinterManager().startModelScan(toDriverModel(target), (device) => {
        if (!mountedRef.current) return;
        setDevices((prev) => {
          const key = device.id.toUpperCase();
          const idx = prev.findIndex((item) => item.id.toUpperCase() === key);
          if (idx === -1) return [...prev, device];
          const next = [...prev];
          next[idx] = mergeDevice(next[idx], device);
          return next;
        });
      });
      if (mountedRef.current) {
        setScanErrors(result.errors);
        if (result.errors.some((entry) => isBluetoothOffError(entry))) setBluetoothOn(false);
        if (result.paired + result.nearby === 0) {
          setNativeHint(
            result.errors[0] ||
              getPrinterManager().getLastScanError() ||
              `No ${meta.shortName} printers found nearby.`,
          );
        }
      }
    } catch (error) {
      if (mountedRef.current) {
        const message = error instanceof Error ? error.message : `Could not scan for ${meta.shortName}.`;
        setNativeHint(message);
        refreshCaps();
        if (!isBluetoothOffError(error)) Alert.alert('Bluetooth scan failed', message);
      }
    } finally {
      if (mountedRef.current) setScanning(false);
    }
  }, [refreshCaps, selectedModel]);

  const handleModelChange = (modelId: ConsumerPrinterId) => {
    if (modelId === selectedModel) return;
    if (getPrinterManager().isConnected) return;
    setSelectedPrinterModel(modelId);
    setDevices([]);
    setNativeHint(null);
    setScanErrors([]);
    void startScan(modelId);
  };

  useFocusEffect(
    useCallback(() => {
      mountedRef.current = true;
      refreshCaps();
      let cancelled = false;
      const mgr = getPrinterManager();
      const live = usePrinterStore.getState();
      const keepConnected = () => {
        if (live.status !== 'connected' && live.status !== 'printing') {
          live.setStatus('connected');
        }
      };
      const beginScanIfIdle = () => {
        if (cancelled || getPrinterManager().isConnected) return;
        const store = usePrinterStore.getState();
        if (store.status === 'connected' || store.status === 'printing') {
          store.clearConnection();
        }
        void startScan(store.selectedPrinterModel).catch(() => {});
      };

      if (mgr.isConnected || mgr.isConnectionHealthy()) {
        keepConnected();
      } else if (live.status === 'connected' || live.status === 'printing' || live.sdkId === 'josh') {
        // Josh often reports ACL_DISCONNECTED while LPAPI is still coming up.
        setTimeout(() => {
          if (cancelled) return;
          if (getPrinterManager().isConnected || getPrinterManager().isConnectionHealthy()) {
            keepConnected();
            return;
          }
          beginScanIfIdle();
        }, 1600);
      } else {
        beginScanIfIdle();
      }
      return () => {
        cancelled = true;
        mountedRef.current = false;
        if (!getPrinterManager().isConnected) {
          getPrinterManager().stopScan();
        }
      };
    }, [refreshCaps, startScan]),
  );

  useEffect(() => {
    const appSub = AppState.addEventListener('change', (next) => {
      if (next !== 'active' || !mountedRef.current) return;
      const { caps: nextCaps, bluetoothOn: on } = refreshCaps();
      const mgr = getPrinterManager();
      if (mgr.isConnected) {
        const live = usePrinterStore.getState();
        if (live.status !== 'connected' && live.status !== 'printing') live.setStatus('connected');
        return;
      }
      if (on && nextCaps.canScan) setNativeHint(null);
      else if (!on && nextCaps.canScan) setNativeHint(null);
    });
    return () => appSub.remove();
  }, [refreshCaps]);

  const listedDevices = useMemo(
    () =>
      [...devices].sort((a, b) => {
        if (Boolean(a.bonded) !== Boolean(b.bonded)) return a.bonded ? -1 : 1;
        return (b.rssi ?? -999) - (a.rssi ?? -999);
      }),
    [devices],
  );

  const connectWith = async (target: ConsumerPrinterId, device: DiscoveredPrinter) => {
    if (target !== usePrinterStore.getState().selectedPrinterModel) {
      setSelectedPrinterModel(target);
    }
    await getPrinterManager().connectModel(toDriverModel(target), device.id, device.name);
    if (!mountedRef.current) return;
    Alert.alert('Connected', `${device.name ?? CONSUMER_PRINTERS[target].shortName} is ready.`, [
      { text: 'Print test label', onPress: () => void handleTestPrint() },
      { text: 'Done', style: 'cancel' },
    ]);
  };

  const handleConnect = async (device: DiscoveredPrinter) => {
    if (!getPrinterManager().isBluetoothEnabled()) {
      setBluetoothOn(false);
      setNativeHint(null);
      setBluetoothOffDialog(true);
      return;
    }

    const pinned = usePrinterStore.getState().pinnedDriverByMac[normalizePrinterMac(device.id)];
    setConnectingId(device.id);
    try {
      if (pinned === 'td404' || pinned === 'josh' || pinned === 'dev' || pinned === 'tez' || pinned === 'labelx') {
        const consumer =
          pinned === 'josh' ? 'josh' : selectedModel === 'rudra' || selectedModel === 'tejas' ? selectedModel : 'tejas';
        if (pinned === 'josh' || pinned === 'td404') {
          await connectWith(consumer, device);
        } else {
          await getPrinterManager().connectModel(pinned, device.id, device.name);
        }
        return;
      }

      const options = choicesFor(device, selectedModel);
      if (options.length > 1) {
        setConnectingId(null);
        Alert.alert('Which printer is this?', `${device.name ?? device.id} could be more than one model.`, [
          ...options.map((modelId) => ({
            text: CONSUMER_PRINTERS[modelId].shortName,
            onPress: () => {
              usePrinterStore.getState().pinDriverForMac(device.id, toDriverModel(modelId), true);
              setConnectingId(device.id);
              void connectWith(modelId, device)
                .catch((error) => {
                  Alert.alert('Connection failed', error instanceof Error ? error.message : 'Could not connect.');
                })
                .finally(() => {
                  if (mountedRef.current) setConnectingId(null);
                });
            },
          })),
          { text: 'Cancel', style: 'cancel' as const },
        ]);
        return;
      }
      await connectWith(options[0] ?? selectedModel, device);
    } catch (error) {
      if (mountedRef.current) {
        Alert.alert(
          'Connection failed',
          error instanceof Error ? error.message : `Could not connect to ${printer.shortName}.`,
        );
      }
    } finally {
      if (mountedRef.current) setConnectingId(null);
    }
  };

  const handleDisconnect = async () => {
    try {
      await getPrinterManager().disconnect();
      void startScan(usePrinterStore.getState().selectedPrinterModel);
    } catch (error) {
      Alert.alert('Disconnect failed', error instanceof Error ? error.message : 'Could not disconnect.');
    }
  };

  const handleTestPrint = async () => {
    setTesting(true);
    try {
      const testName = selectedModel === 'josh' ? 'test print sent by sez print' : `Sez Print ${printer.shortName}`;
      await getPrinterManager().printTestLabel(testName);
      Alert.alert('Test print sent', `Check ${printer.shortName} for a sample label.`);
    } catch (error) {
      Alert.alert('Test print failed', error instanceof Error ? error.message : 'Could not send the test print.');
    } finally {
      setTesting(false);
    }
  };

  const showBluetoothSettings =
    Platform.OS !== 'web' &&
    status !== 'connected' &&
    (!bluetoothOn || listedDevices.length === 0 || scanErrors.length > 0 || Boolean(nativeHint) || !caps.canScan);
  const bluetoothSettingsLabel = Platform.OS === 'ios' ? 'Open Settings' : 'Open Bluetooth settings';
  const connected = status === 'connected' || status === 'printing';

  return (
    <View style={styles.root}>
      <SettingsStackHeader title="Connect printer" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.four }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.inner}>
          {connected ? (
            <ConnectedActions
              modelId={printer.id}
              modelName={printer.shortName}
              deviceName={deviceName}
              testing={testing}
              onTest={() => void handleTestPrint()}
              onDisconnect={() => void handleDisconnect()}
              onDiagnostics={() => router.push('/printer-diagnostics')}
            />
          ) : (
            <>
          <PrinterFamilyCards selectedId={printer.id} onSelect={handleModelChange} />
          <BluetoothBlockers
            canScan={caps.canScan}
            reason={caps.reason}
            bluetoothOn={bluetoothOn}
            settingsLabel={bluetoothSettingsLabel}
            onOpenSettings={() => void openPhoneBluetoothSettings()}
          />
          {nativeHint && !isBluetoothOffError(nativeHint) ? (
            <Text style={styles.warn}>{nativeHint}</Text>
          ) : null}
          {scanErrors.filter((entry) => !isBluetoothOffError(entry)).length > 0 ? (
            <Text style={styles.warn}>
              {scanErrors.filter((entry) => !isBluetoothOffError(entry)).join(' · ')}
            </Text>
          ) : null}
          {showBluetoothSettings && caps.canScan && bluetoothOn ? (
            <Text onPress={() => void openPhoneBluetoothSettings()} style={styles.settingsLink}>
              {bluetoothSettingsLabel}
            </Text>
          ) : null}
          {caps.canScan && bluetoothOn ? (
            <DeviceList
              devices={listedDevices}
              scanning={scanning}
              canScan={caps.canScan}
              bluetoothOn={bluetoothOn}
              connectingId={connectingId}
              accent={printer.accent}
              onConnect={(device) => void handleConnect(device)}
              onRescan={() => void startScan(printer.id).catch(() => {})}
              badgeFor={badgeFor}
            />
          ) : null}
            </>
          )}
          <BluetoothOffDialog
            visible={bluetoothOffDialog}
            settingsLabel={bluetoothSettingsLabel}
            onOpenSettings={() => {
              setBluetoothOffDialog(false);
              void openPhoneBluetoothSettings();
            }}
            onClose={() => setBluetoothOffDialog(false)}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.screen, alignItems: 'center' },
  scroll: { flex: 1, width: '100%' },
  content: { alignItems: 'center', paddingHorizontal: Spacing.three, paddingTop: Spacing.three },
  inner: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.three },
  warn: { color: '#B45309', fontSize: 13, lineHeight: 18 },
  settingsLink: { color: Palette.accent, fontSize: 14, fontWeight: '700', textAlign: 'center' },
});
