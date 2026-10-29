import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, Image, PixelRatio, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { PrinterBatteryLabel } from '@/components/printers/printer-battery-label';
import { CONSUMER_PRINTERS } from '@/constants/printer-models';
import { PRINTER_PHOTOS } from '@/constants/printer-photos';
import { androidRipple, HomeLayout, HomeStatusColors } from '@/constants/ui'; // theme-fixed: status fills keep white text readable in both themes
import { printerReportsBattery } from '@/lib/printer/printer-battery';
import { isJoshPrinter } from '@/lib/printer/battery-percent';
import { getPrinterManager } from '@/lib/printer/printer-manager';
import { usePrinterNickname, usePrinterStore, type PrinterConnectionStatus } from '@/stores/printer-store';
import { pillVariant, type PillVariant } from '@/lib/layout/home-header-fit';
import { registerWalkthroughTarget } from '@/lib/walkthrough/registry';
import { C, themedStyles, useThemeRefresh } from '@/theme';
import { FONT_SCALE_CAP } from '@/theme/font-scale';

// Only two states show: a background reconnect stays "Not connected" until it succeeds.
// theme-fixed: solid status fills keep white text readable on the navy header in both themes.
const FILL: Record<PrinterConnectionStatus, string> = {
  disconnected: HomeStatusColors.idle, // theme-fixed: status fill
  scanning: HomeStatusColors.idle, // theme-fixed: status fill
  connecting: HomeStatusColors.idle, // theme-fixed: status fill
  connected: HomeStatusColors.ok, // theme-fixed: status fill
  printing: HomeStatusColors.ok, // theme-fixed: status fill
};

/** A ring that keeps swelling out of the pill and fading, so a missing printer catches the eye. */
function PulseRing({ color, active }: { color: string; active: boolean }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1300, useNativeDriver: true }),
        Animated.delay(300),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse]);
  if (!active) return null;

  const ringStyle = {
    borderColor: color,
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }),
    transform: [
      { scaleX: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) },
      { scaleY: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] }) },
    ],
  };
  return <Animated.View pointerEvents="none" style={[styles.ring, ringStyle]} />;
}

/**
 * The printer card in the header. Home, Print, PDF and Shipping labels all show this one.
 * `poll` keeps the connection and battery in step every few seconds; only Home needs it, since its tab stays
 * mounted while the app is open. `keepLive` shows "Connected" while a job is reconnecting, so the card does
 * not flash "Not connected" mid-print.
 */
export function StatusChip({
  poll = true,
  keepLive = false,
  walkthroughId,
  variant: forcedVariant,
  reserved = 90,
}: {
  poll?: boolean;
  keepLive?: boolean;
  walkthroughId?: string;
  /** Home measures its own header and passes the form; other headers leave it to the window width. */
  variant?: PillVariant;
  /** Width (dp) the rest of the header row takes (padding, back button, gaps), for the automatic form. */
  reserved?: number;
} = {}) {
  const { width: windowWidth } = useWindowDimensions();
  const variant =
    forcedVariant ??
    pillVariant(windowWidth - reserved, Math.min(PixelRatio.getFontScale(), FONT_SCALE_CAP));
  const compact = variant !== 'full';
  // Minimal drops the idle printer icon, but a connected printer's photo always stays.
  const minimal = variant === 'minimal';
  useThemeRefresh();
  const router = useRouter();
  const status = usePrinterStore((s) => s.status);
  const batteryPercent = usePrinterStore((s) => s.batteryPercent);
  const batteryBars = usePrinterStore((s) => s.batteryBars);
  const charging = usePrinterStore((s) => s.charging);
  const sdkId = usePrinterStore((s) => s.sdkId);
  const transport = usePrinterStore((s) => s.transport);
  const showBattery = printerReportsBattery({ sdkId, transport });

  useEffect(() => {
    const sync = () => {
      const mgr = getPrinterManager();
      mgr.reconcileConnectionState();
      mgr.maybeAutoReconnect();
      const liveNow =
        usePrinterStore.getState().status === 'connected' ||
        usePrinterStore.getState().status === 'printing';
      if (liveNow) void mgr.refreshBattery();
    };
    sync();
    if (!poll) return undefined;
    const id = setInterval(sync, 2500);
    return () => clearInterval(id);
  }, [poll]);
  const deviceName = usePrinterStore((s) => s.deviceName);
  const nickname = usePrinterNickname(usePrinterStore((s) => s.deviceId));
  const selectedModel = usePrinterStore((s) => s.selectedPrinterModel);
  const modelName = (CONSUMER_PRINTERS[selectedModel] ?? CONSUMER_PRINTERS.tejas).shortName;

  const live =
    status === 'connected' ||
    status === 'printing' ||
    (keepLive && (status === 'connecting' || status === 'scanning'));
  const fill = live ? HomeStatusColors.ok : FILL[status]; // theme-fixed: status fill
  const printerName = nickname || deviceName || modelName;
  const caption = live ? (status === 'printing' ? 'Printing' : 'Connected') : 'Not connected';
  const text = live ? printerName : 'Tap to connect';
  const josh = isJoshPrinter({ sdkId, transport });
  const batteryLabel =
    showBattery && josh && batteryBars != null
      ? `${batteryBars} of 4 bars`
      : showBattery && !josh && batteryPercent != null
      ? `${batteryPercent}%`
      : showBattery && live
        ? 'battery not reported'
        : '';

  return (
    // The tour measures this view itself (not a wrapper), so its box is exactly the pill on every phone.
    <View
      ref={walkthroughId ? (node) => registerWalkthroughTarget(walkthroughId, node) : undefined}
      collapsable={false}
      style={styles.wrap}>
      <PulseRing color={fill} active={!live} />
      <Pressable
        onPress={() => router.push('/printer-connect')}
        android_ripple={androidRipple}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={
          live && batteryLabel
            ? `Printer ${modelName}: ${caption}, ${text}. Battery ${batteryLabel}`
            : `Printer ${modelName}: ${caption}. ${text}`
        }
        accessibilityHint="Opens printer connection"
        style={({ pressed }) => [
          styles.chip,
          compact && styles.chipCompact,
          { backgroundColor: fill },
          pressed && styles.pressed,
        ]}>
        {minimal && !live ? null : (
        <View style={live ? styles.photoWrap : styles.iconDisc}>
          {live ? (
            <Image
              source={PRINTER_PHOTOS[CONSUMER_PRINTERS[selectedModel] ? selectedModel : 'tejas']}
              style={styles.photo}
              resizeMode="contain"
              fadeDuration={0}
              accessibilityIgnoresInvertColors
            />
          ) : (
            <AppIcon name="printer" tintColor={fill} size={16} pointerEvents="none" />
          )}
        </View>
        )}
        <View style={styles.lines}>
          <View style={styles.captionRow}>
            <Text numberOfLines={1} maxFontSizeMultiplier={HomeLayout.labelMaxFontScale} style={styles.caption}>
              {caption.toUpperCase()}
            </Text>
            {live && showBattery ? (
              <PrinterBatteryLabel
                percent={batteryPercent}
                bars={josh ? batteryBars : undefined}
                charging={josh && charging}
                size={15}
                onDark
                showWhenUnknown
                unknownText="—"
              />
            ) : null}
          </View>
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            maxFontSizeMultiplier={HomeLayout.labelMaxFontScale}
            style={styles.text}>
            {text}
          </Text>
        </View>
        {compact ? null : (
          <AppIcon name="chevron.right" tintColor={C.onAccent} size={14} pointerEvents="none" />
        )}
      </Pressable>
    </View>
  );
}

const styles = themedStyles((c) => ({
  wrap: { maxWidth: 240 },
  ring: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    borderWidth: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    minHeight: HomeLayout.chipHeight + 4,
    paddingVertical: 7,
    paddingLeft: 8,
    paddingRight: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)', // theme-fixed: light edge on the status fill
    overflow: 'hidden',
  },
  // Narrow header: drop the chevron and tighten up so the pill leaves room for the brand name.
  chipCompact: { gap: 6, paddingLeft: 6, paddingRight: 8 },
  iconDisc: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: c.onAccent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The printer photo sits straight on the status colour, with no disc behind it.
  photoWrap: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  photo: { width: 34, height: 34 },
  lines: { flexShrink: 1, minWidth: 0 },
  captionRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  caption: {
    flexShrink: 1,
    color: c.onAccent,
    opacity: 0.85,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  text: {
    color: c.onAccent,
    fontSize: 14,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.8,
  },
}));
