import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { Spacing } from '@/constants/theme';
import { Palette } from '@/constants/ui';
import type { DiscoveredPrinter } from '@/lib/printer/printer-manager';

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
  badgeFor,
}: DeviceListProps) {
  const list = Array.isArray(devices) ? devices : [];
  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.section}>Printers ({list.length})</Text>
        <View style={styles.headerActions}>
          {scanning ? <ActivityIndicator size="small" color={accent} /> : null}
          {!scanning && canScan && bluetoothOn ? (
            <Pressable onPress={onRescan} hitSlop={8} style={({ pressed }) => pressed && styles.pressed}>
              <Text style={styles.rescan}>Scan again</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <Section
        empty={emptyCopy(list.length, canScan, bluetoothOn, scanning)}
        devices={list}
        connectingId={connectingId}
        accent={accent}
        onConnect={onConnect}
        badgeFor={badgeFor}
      />
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
  return (
    <View style={styles.block}>
      <View style={styles.card}>
        {empty ? (
          <Text style={styles.empty}>{empty}</Text>
        ) : (
          devices.map((device, index) => {
            const badge = badgeFor(device);
            return (
              <Pressable
                key={device.id}
                onPress={() => onConnect(device)}
                style={({ pressed }) => [
                  styles.row,
                  index < devices.length - 1 && styles.rowBorder,
                  pressed && styles.pressed,
                ]}>
                <AppIcon name="printer" tintColor={Palette.muted} size={20} />
                <View style={styles.info}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name} numberOfLines={1}>
                      {device.name ?? 'Unknown printer'}
                    </Text>
                    {badge ? (
                      <View style={[styles.badge, { backgroundColor: badge.background, borderColor: badge.border }]}>
                        <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.meta}>
                    {device.bonded ? 'Already paired' : 'Nearby'}
                    {device.rssi != null ? ` · signal ${signalLabel(device.rssi)}` : ''}
                  </Text>
                </View>
                {connectingId === device.id ? (
                  <ActivityIndicator size="small" color={accent} />
                ) : (
                  <Text style={[styles.connect, { color: accent }]}>Connect</Text>
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
): string | null {
  if (count > 0) return null;
  if (!canScan) return 'Build the Android app to list printers from phone Bluetooth.';
  if (!bluetoothOn) return 'Turn Bluetooth on to see printers.';
  if (scanning) return 'Looking for printers…';
  return 'No printers yet. Turn the printer on, then scan again.';
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.three },
  block: { gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  section: {
    fontSize: 12,
    fontWeight: '700',
    color: Palette.muted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  rescan: { color: Palette.accent, fontSize: 14, fontWeight: '700' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: Spacing.three,
    paddingVertical: 4,
  },
  empty: { color: Palette.muted, fontSize: 14, lineHeight: 20, paddingVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EAECEF' },
  info: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flexShrink: 1, fontSize: 15, fontWeight: '600', color: Palette.ink },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },
  meta: { fontSize: 12, color: '#94A3B8' },
  connect: { fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.7 },
});
