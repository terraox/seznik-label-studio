import { ActivityIndicator, Pressable, Switch, Text, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { Spacing } from '@/constants/theme';
import { androidRipple } from '@/constants/ui';
import { normalizePrinterMac, usePrinterNickname } from '@/stores/printer-store';
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
  autoConnect: boolean;
  onAutoConnectChange: (on: boolean) => void;
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
  autoConnect,
  onAutoConnectChange,
  onConnect,
}: LastConnectedPrinterProps) {
  useThemeRefresh();
  const nickname = usePrinterNickname(deviceId);
  if (!visible) return null;

  const btName = deviceName?.trim() || null;
  const displayName = nickname || btName || modelName;
  // With a nickname set, the Bluetooth name still shows, paired or not.
  const showBtName = Boolean(nickname && btName && btName !== nickname);
  const mac = normalizePrinterMac(deviceId);
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
              {showBtName ? (
                <Text style={styles.btName} numberOfLines={1}>{btName}</Text>
              ) : null}
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

          <View style={styles.autoRow}>
            <Text style={styles.autoLabel}>Auto-connect to this printer</Text>
            <Switch
              value={autoConnect}
              onValueChange={onAutoConnectChange}
              trackColor={{ false: C.border, true: C.accent }}
              thumbColor="#FFFFFF" // theme-fixed: white switch thumb in both themes
            />
          </View>
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
  btName: { fontSize: 12, color: c.textMuted },
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
  autoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  autoLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: c.text },
  pressed: { opacity: 0.9 },
}));
