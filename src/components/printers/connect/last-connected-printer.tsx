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
  /** Epoch ms of the last successful connection. */
  connectedAt?: number;
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
  connectedAt,
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
  const last = connectedAt ? formatLastConnected(connectedAt) : null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.section}>Quick reconnect</Text>
      <View style={styles.card}>
        <View style={styles.stripe} />
        <View style={styles.body}>
          <View style={styles.topRow}>
            <View style={styles.iconTile}>
              <AppIcon name="printer.fill" tintColor={C.accentInk} size={26} />
            </View>
            <View style={styles.copy}>
              <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: status.dot }]} />
                <Text style={[styles.statusText, { color: status.tone }]}>{status.label}</Text>
              </View>
            </View>
            {last ? (
              <View style={styles.lastWrap} accessibilityLabel={`Last connected ${last.date} ${last.time}`}>
                <Text style={styles.lastLabel}>Last connected</Text>
                <Text style={styles.lastDate}>{last.date}</Text>
                <Text style={styles.lastTime}>{last.time}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.chips}>
            <View style={styles.chip}>
              <Text style={styles.chipText} numberOfLines={1}>{modelName}</Text>
            </View>
            <View style={styles.chip}>
              <AppIcon name="bluetooth" tintColor={C.accentInk} size={12} />
              <Text style={styles.chipText} numberOfLines={1}>{bridgeLabel}</Text>
            </View>
            <View style={styles.chip}>
              <Text style={[styles.chipText, styles.mono]} numberOfLines={1}>{mac}</Text>
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
              <>
                <AppIcon name="bluetooth" tintColor={C.onAccent} size={18} />
                <Text style={styles.connectText}>Connect now</Text>
                <AppIcon name="chevron.right" tintColor={C.onAccent} size={16} />
              </>
            )}
          </Pressable>

          <Text style={styles.hint}>{status.hint}</Text>
        </View>
      </View>
    </View>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Date on one line, time on the next, in the phone's local time. */
function formatLastConnected(ms: number): { date: string; time: string } {
  const d = new Date(ms);
  const hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  return {
    date: `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
    time: `${h12}:${minutes} ${hours < 12 ? 'am' : 'pm'}`,
  };
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
    backgroundColor: c.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: c.cardBorder,
    overflow: 'hidden',
    ...cardElevation(c, scheme),
  },
  stripe: { width: 6, backgroundColor: c.accentFill },
  body: { flex: 1, padding: Spacing.three, gap: 14 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  iconTile: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: c.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, gap: 4, minWidth: 0 },
  name: { fontSize: 19, fontWeight: '800', color: c.text },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontWeight: '700' },
  lastWrap: { alignItems: 'flex-end', gap: 1 },
  lastLabel: { fontSize: 10, fontWeight: '700', color: c.textMuted, letterSpacing: 0.3, textTransform: 'uppercase' },
  lastDate: { fontSize: 12, fontWeight: '700', color: c.text },
  lastTime: { fontSize: 12, fontWeight: '600', color: c.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: c.accentSoft,
    maxWidth: '100%',
  },
  chipText: { fontSize: 12, fontWeight: '600', color: c.textSecondary, flexShrink: 1 },
  mono: { fontVariant: ['tabular-nums'] },
  connectBtn: {
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: c.accentFill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  connectBtnBusy: { opacity: 0.9 },
  connectText: { color: c.onAccent, fontSize: 16, fontWeight: '800' },
  hint: { fontSize: 12, lineHeight: 17, color: c.textMuted, textAlign: 'center' },
  pressed: { opacity: 0.9 },
}));
