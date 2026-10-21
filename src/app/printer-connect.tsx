import * as Linking from 'expo-linking';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Platform, Text, View } from 'react-native';
import { FormScrollView } from '@/components/ui/form-scroll-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  BluetoothBlockers,
  BluetoothOffDialog,
  ConnectedActions,
  NicknameDialog,
  DeviceList,
  LastConnectedPrinter,
  PrinterFamilyCards,
  type DeviceBadge,
} from '@/components/printers/connect';
import { SettingsStackHeader } from '@/components/settings-stack-header';
import {
  CONSUMER_PRINTERS,
  isConsumerPrinterId,
  toDriverModel,
  type ConsumerPrinterId,
} from '@/constants/printer-models';
import { MaxContentWidth, Spacing } from '@/constants/theme';

import { isBluetoothOffError } from '@/lib/printer/bluetooth-guard';
import { bridgeDisplayLabel, defaultBridgeForConsumer } from '@/lib/printer/printer-bridge';
import { getAmbiguousModelCandidates } from '@/lib/printer/printer-heuristics';
import {
  getPrinterManager,
  isLikelyJoshName,
  isLikelyTd404Name,
  type BluetoothCapabilities,
  type DiscoveredPrinter,
} from '@/lib/printer/printer-manager';
import { printerReportsBattery } from '@/lib/printer/printer-battery';
import { isJoshPrinter } from '@/lib/printer/battery-percent';
import { useAuthStore } from '@/stores/auth-store';
import { JOSH_LID_MESSAGE, joshLidOpen } from '@/lib/printer/josh-status';
import { useJoshProgressStore } from '@/stores/josh-progress-store';
import { normalizePrinterMac, usePrinterNickname, usePrinterStore } from '@/stores/printer-store';
import { themedStyles, useThemeRefresh } from '@/theme';

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

/** Bluetooth name prefix each printer family advertises (matched case-insensitively). */
const PRINTER_NAME_PREFIX: Record<string, string> = {
  tejas: 'B15',
  rudra: 'B17',
  josh: 'LD0801',
};

export default function PrinterConnectScreen() {
  useThemeRefresh();
  const insets = useSafeAreaInsets();
  const status = usePrinterStore((s) => s.status);
  const deviceName = usePrinterStore((s) => s.deviceName);
  const connectedDeviceId = usePrinterStore((s) => s.deviceId);
  const nickname = usePrinterNickname(connectedDeviceId);
  const [nicknameOpen, setNicknameOpen] = useState(false);
  const batteryPercent = usePrinterStore((s) => s.batteryPercent);
  const batteryBars = usePrinterStore((s) => s.batteryBars);
  const charging = usePrinterStore((s) => s.charging);
  const sdkId = usePrinterStore((s) => s.sdkId);
  const transport = usePrinterStore((s) => s.transport);
  const purchasedPrinterId = useAuthStore((s) => s.user?.printerId);
  const selectedModel = usePrinterStore((s) => s.selectedPrinterModel);
  const showBattery = printerReportsBattery({ sdkId, transport });
  const setSelectedPrinterModel = usePrinterStore((s) => s.setSelectedPrinterModel);

  const printer = CONSUMER_PRINTERS[selectedModel] ?? CONSUMER_PRINTERS.tejas;

  const [devices, setDevices] = useState<DiscoveredPrinter[]>([]);
  const [scanning, setScanning] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [nativeHint, setNativeHint] = useState<string | null>(null);
  const [scanErrors, setScanErrors] = useState<string[]>([]);
  /** True once a scan finished with no errors, so 'not in the list' reliably means unpaired. */
  const [scanCleanDone, setScanCleanDone] = useState(false);
  const [caps, setCaps] = useState<BluetoothCapabilities>(() => getPrinterManager().getCapabilities());
  const [bluetoothOn, setBluetoothOn] = useState(() => getPrinterManager().isBluetoothEnabled());
  const [bluetoothOffDialog, setBluetoothOffDialog] = useState(false);
  const [autoConnectPaused, setAutoConnectPaused] = useState(() =>
    getPrinterManager().isAutoReconnectSuppressed(),
  );
  const mountedRef = useRef(true);
  /** Bumped per scan so a superseded scan cannot touch the list or spinner. */
  const scanTokenRef = useRef(0);
  const autoConnectKeyRef = useRef<string | null>(null);
  const connectRequestRef = useRef(0);
  /** Silent background reconnect in flight. Never shown as a spinner (printer may simply be off). */
  const autoConnectingRef = useRef(false);
  /** Printer the user tapped. Stops auto-reconnect from putting the previous one back. */
  const userTargetRef = useRef<string | null>(null);

  const activeBridge = defaultBridgeForConsumer(selectedModel);
  const lastForBridge = usePrinterStore((s) => s.lastDeviceForBridge[activeBridge] ?? null);

  const refreshCaps = useCallback(() => {
    const mgr = getPrinterManager();
    const nextCaps = mgr.getCapabilities();
    const on = mgr.isBluetoothEnabled();
    setCaps(nextCaps);
    setBluetoothOn(on);
    return { caps: nextCaps, bluetoothOn: on };
  }, []);

  const attemptAutoConnectLast = useCallback(
    async (device?: DiscoveredPrinter) => {
      const mgr = getPrinterManager();
      if (mgr.isConnectionHealthy()) return;
      if (mgr.isAutoReconnectSuppressed()) return;
      if (connectingId || autoConnectingRef.current) return;
      const store = usePrinterStore.getState();
      if (store.status === 'connecting' || store.status === 'printing') return;
      const last = store.lastDeviceForBridge[defaultBridgeForConsumer(selectedModel)];
      if (!last?.id) return;
      if (last.consumer !== selectedModel) return;
      const picked = userTargetRef.current;
      if (picked && normalizePrinterMac(picked) !== normalizePrinterMac(last.id)) return;
      if (device && normalizePrinterMac(device.id) !== normalizePrinterMac(last.id)) return;
      if (!mgr.isBluetoothEnabled()) return;
      const sessionKey = `${selectedModel}:${last.id}`;
      if (autoConnectKeyRef.current === sessionKey) return;
      autoConnectingRef.current = true;
      try {
        const ok = await mgr.reconnectLastForConsumer(selectedModel);
        if (ok && userTargetRef.current == null) autoConnectKeyRef.current = sessionKey;
      } finally {
        autoConnectingRef.current = false;
      }
    },
    [connectingId, selectedModel],
  );

  const startScan = useCallback(async (target: ConsumerPrinterId = selectedModel) => {
    if (getPrinterManager().isConnectionHealthy()) return;
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
    const token = ++scanTokenRef.current;
    // Keep the current list on screen while rescanning (clearing it made the list flicker
    // empty and refill). Devices not seen again are dropped when the scan finishes.
    const seenThisScan = new Set<string>();
    setScanning(true);
    setNativeHint(null);
    setScanErrors([]);
    setScanCleanDone(false);
    try {
      const result = await getPrinterManager().startModelScan(toDriverModel(target), (device) => {
        if (!mountedRef.current || token !== scanTokenRef.current) return;
        seenThisScan.add(device.id.toUpperCase());
        setDevices((prev) => {
          const key = device.id.toUpperCase();
          const idx = prev.findIndex((item) => item.id.toUpperCase() === key);
          if (idx === -1) return [...prev, device];
          const next = [...prev];
          next[idx] = mergeDevice(next[idx], device);
          return next;
        });
        void attemptAutoConnectLast(device);
      });
      if (mountedRef.current && token === scanTokenRef.current) {
        setDevices((prev) => prev.filter((item) => seenThisScan.has(item.id.toUpperCase())));
        setScanErrors(result.errors);
        setScanCleanDone(result.errors.length === 0);
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
      if (mountedRef.current && token === scanTokenRef.current) {
        const message = error instanceof Error ? error.message : `Could not scan for ${meta.shortName}.`;
        setNativeHint(message);
        refreshCaps();
        if (!isBluetoothOffError(error)) Alert.alert('Bluetooth scan failed', message);
      }
    } finally {
      if (mountedRef.current && token === scanTokenRef.current) setScanning(false);
    }
  }, [attemptAutoConnectLast, refreshCaps, selectedModel]);

  // The focus effect below must run only when the screen gains or loses focus. If it listed
  // these callbacks as dependencies, any change to them (selected printer, connecting id) would
  // run its cleanup, stop the scan, and restart it: that is the flicker.
  const startScanRef = useRef(startScan);
  startScanRef.current = startScan;
  const attemptAutoConnectLastRef = useRef(attemptAutoConnectLast);
  attemptAutoConnectLastRef.current = attemptAutoConnectLast;
  const refreshCapsRef = useRef(refreshCaps);
  refreshCapsRef.current = refreshCaps;
  const purchasedPrinterIdRef = useRef(purchasedPrinterId);
  purchasedPrinterIdRef.current = purchasedPrinterId;

  const handleModelChange = (modelId: ConsumerPrinterId) => {
    if (modelId === selectedModel) return;
    if (getPrinterManager().isConnectionHealthy()) return;
    getPrinterManager().invalidatePendingReconnects();
    getPrinterManager().stopScan();
    setSelectedPrinterModel(modelId);
    setDevices([]);
    setNativeHint(null);
    setScanErrors([]);
    autoConnectKeyRef.current = null;
    void startScan(modelId);
  };

  useFocusEffect(
    useCallback(() => {
      mountedRef.current = true;
      refreshCapsRef.current();
      let cancelled = false;

      const syncConnection = (allowScan: boolean) => {
        if (cancelled) return;
        const mgr = getPrinterManager();
        const store = usePrinterStore.getState();
        if (store.status === 'connecting') {
          return;
        }
        if (store.status === 'connected' || store.status === 'printing' || mgr.isConnectionHealthy()) {
          mgr.reconcileConnectionState();
          void mgr.refreshBattery({ force: true });
          mgr.stopScan();
          return;
        }
        mgr.reconcileConnectionState();
        if (!allowScan || store.status === 'scanning') {
          return;
        }
        const begin = () => {
          if (cancelled) return;
          if (!mgr.isAutoReconnectSuppressed()) {
            void attemptAutoConnectLastRef.current().catch(() => {});
          }
          void startScanRef.current(usePrinterStore.getState().selectedPrinterModel).catch(() => {});
        };
        // On open, pre-select the printer last connected, else the one they registered
        // (bridge follows automatically).
        const purchased = purchasedPrinterIdRef.current;
        const opening = store.preferredPrinterModel ?? purchased;
        if (isConsumerPrinterId(opening) && opening !== store.selectedPrinterModel) {
          store.setSelectedPrinterModel(opening);
          // Let the re-render hand the scan callbacks the new model before scanning.
          setTimeout(begin, 60);
          return;
        }
        begin();
      };

      syncConnection(true);

      return () => {
        cancelled = true;
        mountedRef.current = false;
        const store = usePrinterStore.getState();
        if (store.status !== 'connected' && store.status !== 'printing') {
          getPrinterManager().stopScan();
        }
      };
    }, []),
  );

  useEffect(() => {
    const appSub = AppState.addEventListener('change', (next) => {
      if (next !== 'active' || !mountedRef.current) return;
      const { caps: nextCaps, bluetoothOn: on } = refreshCaps();
      getPrinterManager().reconcileConnectionState();
      if (on && nextCaps.canScan) setNativeHint(null);
      else if (!on && nextCaps.canScan) setNativeHint(null);
      // Coming back from Android Bluetooth settings (pairing a new printer) does not re-focus
      // the screen, so rescan here or the newly paired printer never shows up.
      const store = usePrinterStore.getState();
      const busy = store.status === 'connecting' || store.status === 'printing';
      if (on && nextCaps.canScan && !busy && !getPrinterManager().isConnectionHealthy()) {
        void startScanRef.current(store.selectedPrinterModel).catch(() => {});
      }
    });
    return () => appSub.remove();
  }, [refreshCaps]);

  const showConnected = status === 'connected' || status === 'printing';

  // Josh: watch the printer while the card is up so an open lid is flagged right away.
  const joshLidOpenNow = useJoshProgressStore((s) => joshLidOpen(s.deviceStatus) === true);
  const watchingJosh = showConnected && sdkId === 'josh';
  useEffect(() => {
    if (!watchingJosh) return;
    return getPrinterManager().watchJoshStatus();
  }, [watchingJosh]);

  const [showAllDevices, setShowAllDevices] = useState(false);
  useEffect(() => {
    setShowAllDevices(false);
  }, [selectedModel]);

  const namePrefix = PRINTER_NAME_PREFIX[selectedModel];
  const sortedDevices = useMemo(
    () =>
      [...devices].sort((a, b) => {
        if (Boolean(a.bonded) !== Boolean(b.bonded)) return a.bonded ? -1 : 1;
        return (b.rssi ?? -999) - (a.rssi ?? -999);
      }),
    [devices],
  );
  const matchingDevices = useMemo(
    () =>
      sortedDevices.filter((d) => {
        const name = (d.name ?? '').toUpperCase();
        if (name.startsWith(namePrefix)) return true;
        // An unpaired printer is often seen before its name resolves (only the MAC shows).
        // Keep it listed so it can be paired from here.
        const unnamed = !name || name === d.id.toUpperCase() || name.startsWith('BLUETOOTH ');
        return selectedModel === 'josh' && !d.bonded && unnamed;
      }),
    [sortedDevices, namePrefix, selectedModel],
  );
  // Show all: printers matching this family's name first, everything else below them.
  const allDevicesMatchFirst = useMemo(() => {
    const matching = new Set(matchingDevices.map((d) => d.id));
    return [...matchingDevices, ...sortedDevices.filter((d) => !matching.has(d.id))];
  }, [matchingDevices, sortedDevices]);
  const listedDevices = showAllDevices ? allDevicesMatchFirst : matchingDevices;

  const lastConsumer = lastForBridge?.consumer ?? selectedModel;
  const lastPrinterMeta = CONSUMER_PRINTERS[lastConsumer] ?? printer;
  const lastNearby = useMemo(() => {
    if (!lastForBridge?.id) return false;
    const key = normalizePrinterMac(lastForBridge.id);
    return listedDevices.some((d) => normalizePrinterMac(d.id) === key);
  }, [lastForBridge?.id, listedDevices]);

  // Paired printers are always listed (in range or not), so a clean scan that lacks the last
  // printer means it was unpaired from Android Bluetooth settings.
  const lastUnpaired = Boolean(lastForBridge?.id) && scanCleanDone && !scanning && !lastNearby;

  const connectWith = async (target: ConsumerPrinterId, device: DiscoveredPrinter) => {
    if (target !== usePrinterStore.getState().selectedPrinterModel) {
      setSelectedPrinterModel(target);
    }
    await getPrinterManager().connectModel(toDriverModel(target), device.id, device.name);
    const live = usePrinterStore.getState().deviceId;
    if (live && normalizePrinterMac(live) === normalizePrinterMac(device.id)) {
      // Connected: open this printer next time. Back on the purchased one clears the override.
      const purchased = purchasedPrinterIdRef.current;
      usePrinterStore
        .getState()
        .setPreferredPrinterModel(isConsumerPrinterId(purchased) && purchased === target ? null : target);
      userTargetRef.current = null;
      getPrinterManager().allowAutoReconnectAgain();
      setAutoConnectPaused(false);
    }
  };

  const handleConnect = async (device: DiscoveredPrinter) => {
    if (!getPrinterManager().isBluetoothEnabled()) {
      setBluetoothOn(false);
      setNativeHint(null);
      setBluetoothOffDialog(true);
      return;
    }

    const mgr = getPrinterManager();
    const lastId = usePrinterStore.getState().lastDeviceForBridge[defaultBridgeForConsumer(selectedModel)]?.id;
    const switching = lastId != null && normalizePrinterMac(lastId) !== normalizePrinterMac(device.id);
    userTargetRef.current = device.id;
    mgr.invalidatePendingReconnects();
    mgr.stopScan();
    if (switching) {
      mgr.suppressAutoReconnect();
      setAutoConnectPaused(true);
    } else {
      mgr.allowAutoReconnectAgain();
      setAutoConnectPaused(false);
    }
    const pinned = usePrinterStore.getState().pinnedDriverByMac[normalizePrinterMac(device.id)];
    const request = ++connectRequestRef.current;
    setConnectingId(device.id);
    usePrinterStore.getState().setStatus('connecting');
    try {
      // Unpaired Josh printer: open the system pairing dialog first, then connect.
      if (selectedModel === 'josh' && !device.bonded) {
        const paired = await mgr.pairJoshDevice(device.id);
        if (request !== connectRequestRef.current) return;
        if (!paired) {
          usePrinterStore.getState().setStatus('disconnected');
          Alert.alert('Not paired', `Pairing with ${device.name || device.id} was cancelled or failed.`);
          return;
        }
        setDevices((prev) => prev.map((d) => (d.id === device.id ? { ...d, bonded: true } : d)));
      }
      if (pinned === 'td404' || pinned === 'josh' || pinned === 'dev' || pinned === 'tez' || pinned === 'labelx') {
        const consumer =
          pinned === 'josh' ? 'josh' : selectedModel === 'rudra' || selectedModel === 'tejas' ? selectedModel : 'tejas';
        if (pinned === 'josh' || pinned === 'td404') {
          await connectWith(consumer, device);
        } else {
          await getPrinterManager().connectModel(pinned, device.id, device.name);
          const live = usePrinterStore.getState().deviceId;
          if (live && normalizePrinterMac(live) === normalizePrinterMac(device.id)) {
            userTargetRef.current = null;
            getPrinterManager().allowAutoReconnectAgain();
            setAutoConnectPaused(false);
          }
        }
        return;
      }

      const options = choicesFor(device, selectedModel);
      if (options.length > 1) {
        if (usePrinterStore.getState().status === 'connecting') {
          usePrinterStore.getState().setStatus('disconnected');
        }
        setConnectingId(null);
        Alert.alert('Which printer is this?', `${device.name ?? device.id} could be more than one model.`, [
          ...options.map((modelId) => ({
            text: CONSUMER_PRINTERS[modelId].shortName,
            onPress: () => {
              usePrinterStore.getState().pinDriverForMac(device.id, toDriverModel(modelId), true);
              const choiceRequest = ++connectRequestRef.current;
              setConnectingId(device.id);
              usePrinterStore.getState().setStatus('connecting');
              void connectWith(modelId, device)
                .catch((error) => {
                  Alert.alert('Connection failed', error instanceof Error ? error.message : 'Could not connect.');
                })
                .finally(() => {
                  if (mountedRef.current && connectRequestRef.current === choiceRequest) setConnectingId(null);
                });
            },
          })),
          {
            text: 'Cancel',
            style: 'cancel' as const,
            onPress: () => {
              userTargetRef.current = null;
              if (switching) {
                mgr.allowAutoReconnectAgain();
                setAutoConnectPaused(false);
              }
            },
          },
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
      if (mountedRef.current && connectRequestRef.current === request) setConnectingId(null);
    }
  };

  const handleReconnectLast = async () => {
    if (!getPrinterManager().isBluetoothEnabled()) {
      setBluetoothOffDialog(true);
      return;
    }
    getPrinterManager().stopScan();
    getPrinterManager().allowAutoReconnectAgain();
    setAutoConnectPaused(false);
    autoConnectKeyRef.current = null;
    userTargetRef.current = null;
    const request = ++connectRequestRef.current;
    usePrinterStore.getState().setStatus('connecting');
    setConnectingId(lastForBridge?.id ?? 'reconnect');
    try {
      const ok = await getPrinterManager().reconnectLastForConsumer(selectedModel, { userRequested: true });
      if (!ok) {
        const reason = getPrinterManager().getLastErrorMessage();
        Alert.alert(
          'Could not connect',
          `${reason ? `${reason}\n\n` : ''}Turn the printer on and stay on this screen — we will connect when it appears.`,
        );
        void startScan(selectedModel);
      }
    } catch (error) {
      Alert.alert(
        'Connection failed',
        error instanceof Error ? error.message : 'Could not connect to the last printer.',
      );
    } finally {
      if (mountedRef.current && connectRequestRef.current === request) setConnectingId(null);
    }
  };

  const handleDisconnect = async () => {
    try {
      autoConnectKeyRef.current = null;
      userTargetRef.current = null;
      connectRequestRef.current += 1;
      getPrinterManager().stopScan();
      getPrinterManager().suppressAutoReconnect();
      setAutoConnectPaused(true);
      await getPrinterManager().disconnect();
      void startScan(usePrinterStore.getState().selectedPrinterModel);
    } catch (error) {
      Alert.alert('Disconnect failed', error instanceof Error ? error.message : 'Could not disconnect.');
    }
  };

  const handleTestPrint = async () => {
    setTesting(true);
    try {
      await getPrinterManager().printTestLabel();
      Alert.alert('Test print sent', `Check ${printer.shortName} for the diagnostic test label.`);
    } catch (error) {
      Alert.alert('Test print failed', error instanceof Error ? error.message : 'Could not send the test print.');
    } finally {
      setTesting(false);
    }
  };

  const showBluetoothSettings =
    Platform.OS !== 'web' &&
    !showConnected &&
    (!bluetoothOn || listedDevices.length === 0 || scanErrors.length > 0 || Boolean(nativeHint) || !caps.canScan);
  const bluetoothSettingsLabel = Platform.OS === 'ios' ? 'Open Settings' : 'Open Bluetooth settings';

  return (
    <View style={styles.root}>
      <SettingsStackHeader title="Connect printer" />
      <FormScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.four }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.inner}>
          {showConnected ? (
            <ConnectedActions
              modelId={printer.id}
              modelName={printer.shortName}
              deviceName={deviceName}
              nickname={nickname}
              onEditNickname={connectedDeviceId ? () => setNicknameOpen(true) : undefined}
              batteryPercent={batteryPercent}
              batteryBars={isJoshPrinter({ sdkId, transport }) ? batteryBars : undefined}
              charging={charging}
              warning={watchingJosh && joshLidOpenNow ? JOSH_LID_MESSAGE : null}
              showBattery={showBattery}
              testing={testing}
              onTest={() => void handleTestPrint()}
              onDisconnect={() => void handleDisconnect()}
              onDiagnostics={() => router.push('/printer-diagnostics')}
            />
          ) : (
            <>
          <PrinterFamilyCards selectedId={printer.id} onSelect={handleModelChange} />
          <LastConnectedPrinter
            modelName={lastPrinterMeta.shortName}
            bridgeLabel={bridgeDisplayLabel(activeBridge)}
            deviceName={lastForBridge?.name ?? ''}
            deviceId={lastForBridge?.id ?? ''}
            connectedAt={lastForBridge?.connectedAt}
            connecting={Boolean(lastForBridge && connectingId === lastForBridge.id)}
            visible={Boolean(lastForBridge && caps.canScan && bluetoothOn && !lastUnpaired)}
            nearby={lastNearby}
            scanning={scanning}
            autoConnectPaused={autoConnectPaused}
            onConnect={() => void handleReconnectLast()}
          />
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
              showAll={showAllDevices}
              onToggleShowAll={() => setShowAllDevices((v) => !v)}
              namePrefix={namePrefix}
              badgeFor={badgeFor}
            />
          ) : null}
            </>
          )}
          <NicknameDialog
            visible={nicknameOpen && showConnected}
            nickname={nickname}
            deviceName={deviceName}
            onSave={(next) => {
              if (connectedDeviceId) usePrinterStore.getState().setPrinterNickname(connectedDeviceId, next);
              setNicknameOpen(false);
            }}
            onClose={() => setNicknameOpen(false)}
          />
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
      </FormScrollView>
    </View>
  );
}

const styles = themedStyles((c) => ({
  root: { flex: 1, backgroundColor: c.bg, alignItems: 'center' },
  scroll: { flex: 1, width: '100%' },
  content: { alignItems: 'center', paddingHorizontal: Spacing.three, paddingTop: Spacing.three },
  inner: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.three },
  warn: { color: c.warning, fontSize: 13, lineHeight: 18 },
  settingsLink: { color: c.accent, fontSize: 14, fontWeight: '700', textAlign: 'center' },
}));
