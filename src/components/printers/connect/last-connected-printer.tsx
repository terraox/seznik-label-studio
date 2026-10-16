import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { Spacing } from '@/constants/theme';
import { androidRipple } from '@/constants/ui';
import { normalizePrinterMac } from '@/stores/printer-store';
import { C, cardElevation, themedStyles, useThemeRefresh } from '@/theme';

type LastConnectedPrinterProps = {
  modelName: string;
  bridgeLabel: string;
  deviceName: string;
  deviceId: string;
  connecting: boolean;
  visible: boolean;
  nearby: boolean;
  scanning: boolean;
  autoConnectPaused: boolean;
  onConnect: () => void;
};

export function LastConnectedPrinter({
  modelName,
  bridgeLabel,
  deviceName,
  deviceId,
  connecting,
  visible,
  nearby,
  scanning,
  autoConnectPaused,
  onConnect,
}: LastConnectedPrinterProps) {
  useThemeRefresh();
  if (!visible) return null;

  const displayName = deviceName?.trim() || modelName;
  const mac = normalizePrinterMac(deviceId);
  const status = statusCopy({ nearby, scanning, autoConnectPaused });

  return (
    <View style={styles.wrap}>
      <Text style={styles.section}>Quick reconnect</Text>
      <View style={styles.card}>
        <View style={styles.iconBadge}>
          <AppIcon name="printer" tintColor={C.onAccent} size={20} />
        </View>

        <View style={styles.copy}>
          <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
          <Text style={styles.meta} numberOfLines={1}>
            {modelName} · {mac}
          </Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusPill, { backgroundColor: `${status.tone}18` }]}>
              <View style={[styles.statusDot, { backgroundColor: status.dot }]} />
              <Text style={[styles.statusText, { color: status.tone }]}>{status.label}</Text>
            </View>
            <Text style={styles.bridge} numberOfLines={1}>{bridgeLabel}</Text>
          </View>
        </View>

        <Pressable
          onPress={onConnect}
          disabled={connecting}
          android_ripple={androidRipple}
          style={({ pressed }) => [
            styles.connectBtn,
            connecting && styles.connectBtnBusy,
            pressed && !connecting && styles.pressed,
          ]}>
          {connecting ? (
            <ActivityIndicator color={C.onAccent} size="small" />
          ) : (
            <Text style={styles.connectText}>Connect</Text>
          )}
        </Pressable>
      </View>
      <Text style={styles.hint}>{status.hint}</Text>
    </View>
  );
}

function statusCopy({
  nearby,
  scanning,
  autoConnectPaused,
}: {
  nearby: boolean;
  scanning: boolean;
  autoConnectPaused: boolean;
}): { label: string; hint: string; dot: string; tone: string } {
  if (nearby) {
    return {
      label: 'In range',
      hint: autoConnectPaused
        ? 'You disconnected earlier. Tap Connect when you want to link again.'
        : 'Stays linked automatically when this printer is on.',
      dot: C.success,
      tone: C.success,
    };
  }
  if (scanning) {
    return {
      label: 'Scanning',
      hint: autoConnectPaused
        ? 'Searching… tap Connect as soon as your printer appears.'
        : 'Searching — we connect when your printer shows up.',
      dot: C.warning,
      tone: C.warning,
    };
  }
  return {
    label: 'Offline',
    hint: autoConnectPaused
      ? 'Power on the printer, then tap Connect.'
      : 'Power on the printer — linking happens in the background.',
    dot: C.textMuted,
    tone: C.textMuted,
  };
}

const styles = themedStyles((c, scheme) => ({
  wrap: { gap: 8 },
  section: {
    fontSize: 12,
    fontWeight: '700',
    color: c.textMuted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    paddingHorizontal: 2,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: c.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.hairline,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    ...cardElevation(c, scheme),
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: c.header,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, gap: 2, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '700', color: c.text },
  meta: { fontSize: 12, color: c.textSecondary, fontVariant: ['tabular-nums'] },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },
  bridge: { fontSize: 11, color: c.textMuted, flexShrink: 1 },
  connectBtn: {
    minWidth: 88,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: c.accentStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectBtnBusy: { opacity: 0.9 },
  connectText: { color: c.onAccent, fontSize: 14, fontWeight: '700' },
  hint: { fontSize: 12, lineHeight: 17, color: c.textMuted, paddingHorizontal: 4 },
  pressed: { opacity: 0.92 },
}));
