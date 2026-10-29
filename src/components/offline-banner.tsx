import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { checkConnection } from "@/lib/network/monitor";
import { useAuthStore } from "@/stores/auth-store";
import { useNetworkStore } from "@/stores/network-store";
import { makeStyles, useColors } from "@/theme";

const BACK_ONLINE_MS = 2200;
const HIDDEN_Y = -140;
const DISMISS_DISTANCE = 50;
const DISMISS_VELOCITY = 600;

/**
 * Slides in from the top when the phone has no internet and says what still works. When the
 * connection returns it turns green for a moment ("Back online") and slides away.
 */
export function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const c = useColors();
  const online = useNetworkStore((s) => s.online);
  const checking = useNetworkStore((s) => s.checking);
  const signedIn = useAuthStore((s) => s.token !== null);

  const [shown, setShown] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const wasOffline = useRef(false);

  const y = useSharedValue(HIDDEN_Y);
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (!online) {
      // A new offline episode (or a retry that stays offline) never re-shows a swiped-away banner
      // unless the connection came back in between.
      if (!wasOffline.current) setShown(true);
      wasOffline.current = true;
      setRecovered(false);
      return;
    }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    setRecovered(true);
    const t = setTimeout(() => setShown(false), BACK_ONLINE_MS);
    return () => clearTimeout(t);
  }, [online]);

  useEffect(() => {
    if (shown) {
      y.value = withSpring(0, { damping: 16, stiffness: 180, mass: 0.8 });
    } else {
      y.value = withTiming(HIDDEN_Y, {
        duration: 260,
        easing: Easing.in(Easing.cubic),
      });
    }
  }, [shown, y]);

  useEffect(() => {
    if (!online) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
      );
    } else {
      pulse.value = withTiming(0, { duration: 150 });
    }
  }, [online, pulse]);

  const dismiss = () => {
    setShown(false);
    dragX.value = 0;
    dragY.value = 0;
  };

  const swipe = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .activeOffsetY([-12, 12])
    .onUpdate((e) => {
      dragX.value = e.translationX;
      dragY.value = Math.min(0, e.translationY);
    })
    .onEnd((e) => {
      const away =
        Math.abs(e.translationX) > DISMISS_DISTANCE ||
        e.translationY < -DISMISS_DISTANCE ||
        Math.abs(e.velocityX) > DISMISS_VELOCITY ||
        e.velocityY < -DISMISS_VELOCITY;
      if (away) {
        runOnJS(dismiss)();
      } else {
        dragX.value = withSpring(0);
        dragY.value = withSpring(0);
      }
    });

  const slide = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(1, Math.abs(dragX.value) / 300),
    transform: [
      { translateY: y.value + dragY.value },
      { translateX: dragX.value },
    ],
  }));
  const glow = useAnimatedStyle(() => ({
    opacity: 0.18 + pulse.value * 0.32,
    transform: [{ scale: 1 + pulse.value * 0.35 }],
  }));

  if (!shown && online) return null;

  const tint = recovered ? c.success : c.danger;
  const title = recovered ? "Back online" : "No internet connection";
  const body = recovered
    ? "Cloud templates, fonts and sync are available again."
    : signedIn
      ? "Editing and Bluetooth printing still work. Cloud templates, fonts and links need internet."
      : "Sign-in and registration need internet. Turn on mobile data or Wi-Fi.";

  return (
    <Animated.View
      pointerEvents={shown ? "box-none" : "none"}
      style={[styles.wrap, { paddingTop: insets.top + 6 }, slide]}
    >
      <GestureDetector gesture={swipe}>
        <View
          style={[styles.card, { borderColor: tint }]}
          accessibilityRole="alert"
        >
          <View style={styles.iconWrap}>
            <Animated.View
              style={[styles.glow, { backgroundColor: tint }, glow]}
            />
            <Ionicons
              name={recovered ? "cloud-done-outline" : "cloud-offline-outline"}
              size={22}
              color={tint}
            />
          </View>
          <View style={styles.textCol}>
            <Text style={[styles.title, { color: tint }]}>{title}</Text>
            <Text style={styles.body}>{body}</Text>
          </View>
          {recovered ? null : (
            <Pressable
              onPress={() => void checkConnection(true)}
              disabled={checking}
              style={[styles.retry, { borderColor: tint }]}
              accessibilityLabel="Check connection again"
            >
              {checking ? (
                <ActivityIndicator size="small" color={tint} />
              ) : (
                <Text style={[styles.retryText, { color: tint }]}>Retry</Text>
              )}
            </Pressable>
          )}
        </View>
      </GestureDetector>
    </Animated.View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    zIndex: 1000,
    elevation: 1000,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: c.raised,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  iconWrap: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  glow: { position: "absolute", width: 36, height: 36, borderRadius: 18 },
  textCol: { flex: 1, gap: 2 },
  title: { fontSize: 14, fontWeight: "700" },
  body: { fontSize: 12, lineHeight: 16, color: c.textSecondary },
  retry: {
    minWidth: 60,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  retryText: { fontSize: 13, fontWeight: "600" },
}));
