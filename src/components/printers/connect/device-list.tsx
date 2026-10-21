import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { Spacing } from '@/constants/theme';

import { selectPrinterNickname, usePrinterStore } from '@/stores/printer-store';
import type { DiscoveredPrinter } from '@/lib/printer/printer-manager';
import { C, themedStyles, useThemeRefresh } from '@/theme';

export type DeviceBadge = {
  label: string;
  color: string;
  background: string;
  border: string;
};

type DeviceListProps = {
  devices: DiscoveredPrinter[];
  scanning: boolean;
  canScan: boolean;
  bluetoothOn: boolean;
  connectingId: string | null;
  accent: string;
  onConnect: (device: DiscoveredPrinter) => void;
  onRescan: () => void;
  showAll: boolean;
  onToggleShowAll: () => void;
  namePrefix: string;
  badgeFor: (device: DiscoveredPrinter) => DeviceBadge | null;
};

export function DeviceList({
  devices,
  scanning,
  canScan,
  bluetoothOn,
  connectingId,
  accent,
  onConnect,
  onRescan,
  showAll,
  onToggleShowAll,
  namePrefix,
  badgeFor,
}: DeviceListProps) {
  useThemeRefresh();
  const list = Array.isArray(devices) ? devices : [];
  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.section}>Printers ({list.length})</Text>
        <View style={styles.headerActions}>
          {scanning ? <ActivityIndicator size="small" color={accent} /> : null}
          {!scanning && canScan && bluetoothOn ? (
            <Pressable
              onPress={onRescan}
              hitSlop={8}
              style={({ pressed }) => [styles.rescanBtn, { borderColor: accent }, pressed && styles.pressed]}>
              <AppIcon name="arrow.clockwise" tintColor={accent} size={14} />
              <Text style={[styles.rescan, { color: accent }]}>Scan again</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <Section
        empty={emptyCopy(list.length, canScan, bluetoothOn, scanning, showAll ? null : namePrefix)}
        devices={list}
        connectingId={connectingId}
        accent={accent}
        onConnect={onConnect}
        badgeFor={badgeFor}
      />
      <Pressable onPress={onToggleShowAll} hitSlop={8} style={({ pressed }) => [styles.showAll, pressed && styles.pressed]}>
        <Text style={[styles.rescan, { color: accent }]}>
          {showAll ? `Show only ${namePrefix}… printers` : "Can't find yours? Show all devices"}
        </Text>
      </Pressable>
    </View>
  );
}

function Section({
  empty,
  devices,
  connectingId,
  accent,
  onConnect,
  badgeFor,
}: {
  empty: string | null;
  devices: DiscoveredPrinter[];
  connectingId: string | null;
  accent: string;
  onConnect: (device: DiscoveredPrinter) => void;
  badgeFor: (device: DiscoveredPrinter) => DeviceBadge | null;
}) {
  useThemeRefresh();
  const nicknames = usePrinterStore((s) => s.printerNicknames);
  return (
    <View style={styles.block}>
      <View style={styles.card}>
        {empty ? (
          <Text style={styles.empty}>{empty}</Text>
        ) : (
          devices.map((device, index) => {
            const badge = badgeFor(device);
            const nickname = selectPrinterNickname(nicknames, device.id);
            return (
              <Pressable
                key={device.id}
                onPress={() => onConnect(device)}
                style={({ pressed }) => [
                  styles.row,
                  index < devices.length - 1 && styles.rowBorder,
                  pressed && styles.pressed,
                ]}>
                <View style={[styles.rowIcon, { backgroundColor: C.accentSoft }]}>
                  <AppIcon name="printer.fill" tintColor={accent} size={18} />
                </View>
                <View style={styles.info}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name} numberOfLines={1}>
                      {nickname ?? device.name ?? 'Unknown printer'}
                    </Text>
                    {badge ? (
                      <View style={[styles.badge, { backgroundColor: badge.background, borderColor: badge.border }]}>
                        <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.meta}>
                    {nickname && device.name ? `${device.name} · ` : ''}
                    {device.bonded ? 'Already paired' : 'Nearby'}
                    {device.rssi != null ? ` · signal ${signalLabel(device.rssi)}` : ''}
                  </Text>
                </View>
                {connectingId === device.id ? (
                  <ActivityIndicator size="small" color={accent} />
                ) : (
                  <View style={[styles.connectPill, { backgroundColor: accent }]}>
                    <Text style={styles.connect}>Connect</Text>
                  </View>
                )}
              </Pressable>
            );
          })
        )}
      </View>
    </View>
  );
}

function signalLabel(rssi: number): string {
  if (rssi >= -60) return 'strong';
  if (rssi >= -75) return 'good';
  return 'weak';
}

function emptyCopy(
  count: number,
  canScan: boolean,
  bluetoothOn: boolean,
  scanning: boolean,
  filterPrefix: string | null,
): string | null {
  if (count > 0) return null;
  if (!canScan) return 'Build the Android app to list printers from phone Bluetooth.';
  if (!bluetoothOn) return 'Turn Bluetooth on to see printers.';
  if (scanning) return 'Looking for printers…';
  if (filterPrefix) return `No printers starting with ${filterPrefix} found. Turn the printer on, then scan again, or show all devices.`;
  return 'No printers yet. Turn the printer on, then scan again.';
}

const styles = themedStyles((c) => ({
  wrap: { gap: Spacing.three },
  block: { gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  section: {
    fontSize: 12,
    fontWeight: '700',
    color: c.textMuted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  rescanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1.5,
    backgroundColor: c.accentSoft,
  },
  showAll: { alignSelf: 'center', paddingVertical: 6 },
  rescan: { fontSize: 13, fontWeight: '700' },
  card: {
    backgroundColor: c.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.hairline,
    paddingHorizontal: Spacing.three,
    paddingVertical: 4,
  },
  empty: { color: c.textMuted, fontSize: 14, lineHeight: 20, paddingVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.hairline },
  info: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flexShrink: 1, fontSize: 15, fontWeight: '600', color: c.text },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },
  meta: { fontSize: 12, color: c.textMuted },
  rowIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  connectPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999 },
  connect: { fontSize: 13, fontWeight: '700', color: c.onAccent },
  pressed: { opacity: 0.7 },
}));
