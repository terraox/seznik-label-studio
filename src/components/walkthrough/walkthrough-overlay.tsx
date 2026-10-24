import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { makeStyles } from '@/theme';
import {
  measureWalkthroughTarget,
  scrollWalkthroughBy,
  type WindowRect,
} from '@/lib/walkthrough/registry';
import type { WalkthroughStep } from '@/lib/walkthrough/home-steps';
import { useWalkthroughStore, type WalkthroughTour } from '@/stores/walkthrough-store';

const DIM = 'rgba(10, 20, 32, 0.78)'; // theme-fixed: dims whatever is under it, in both themes
const HOLE_PAD = 6;
const RING_INSET = 2;
const CARD_MAX_W = 360;
const CARD_EST_H = 190;

export function WalkthroughOverlay({
  tour,
  steps,
  onFinish,
}: {
  /** Only renders while this tour is the one running. */
  tour: WalkthroughTour;
  steps: readonly WalkthroughStep[];
  /** Called on Done or Skip. */
  onFinish: () => void;
}) {
  const styles = useStyles();
  const activeTour = useWalkthroughStore((s) => s.tour);
  const active = useWalkthroughStore((s) => s.active) && activeTour === tour;
  const stepIndex = useWalkthroughStore((s) => s.stepIndex);
  const goTo = useWalkthroughStore((s) => s.goTo);
  const win = useWindowDimensions();
  // Use the overlay's own laid-out size: on Android the window height can include the
  // system navigation bar while the overlay container does not, which shifts the card.
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const W = size?.w ?? win.width;
  const H = size?.h ?? win.height;
  const insets = useSafeAreaInsets();
  const [rect, setRect] = useState<WindowRect | null>(null);
  const [ready, setReady] = useState(false);
  const [cardH, setCardH] = useState(CARD_EST_H);
  const rootRef = useRef<View>(null);

  const visibleSteps = steps;
  const step = visibleSteps[stepIndex];
  const visible = active && !!step;

  useEffect(() => {
    if (!visible) return;
    // New step: drop the old cutout and hold the card back until the new target is placed.
    setRect(null);
    setReady(false);
    if (!step.target) {
      setReady(true);
      return;
    }
    let cancelled = false;
    const topBound = insets.top + 70;

    // Overlay lives in the same window as the targets (no Modal), so measuring its own
    // origin and subtracting it gives exact overlay-local coordinates on every device.
    const originOf = () =>
      new Promise<{ x: number; y: number }>((resolve) => {
        if (!rootRef.current) return resolve({ x: 0, y: 0 });
        rootRef.current.measureInWindow((x, y) => resolve({ x, y }));
      });

    const run = async (attempt: number) => {
      const [m, o] = await Promise.all([measureWalkthroughTarget(step.target!), originOf()]);
      if (cancelled) return;
      if (!m) {
        setRect(null);
        setReady(true);
        return;
      }
      // Scroll steps: bring the target's top to just under the header so the card fits below it.
      if (step.scrolls && attempt < 2) {
        const dy = m.y - o.y - topBound;
        if (Math.abs(dy) > 4 && scrollWalkthroughBy(dy)) {
          setTimeout(() => !cancelled && void run(attempt + 1), 200);
          return;
        }
      }
      setRect({ x: m.x - o.x, y: m.y - o.y, w: m.w, h: m.h });
      setReady(true);
      // Re-measure once layout/scroll has fully settled so the cutout never lags the target.
      if (attempt < 3) setTimeout(() => !cancelled && void run(3), 350);
    };
    // Let the Modal / tab focus settle before measuring.
    const t = setTimeout(() => void run(0), 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // Window size too: after a rotation every target has moved.
  }, [visible, step, insets.top, win.width, win.height]);

  if (!visible) return null;

  const isLast = stepIndex >= visibleSteps.length - 1;
  // Keep the ring fully inside the overlay (RING_INSET) so targets flush with a screen edge,
  // like the tab bar, still show all four borders.
  const pad = step.holePad;
  const padTop = pad?.top ?? HOLE_PAD;
  const padRight = pad?.right ?? HOLE_PAD;
  const padBottom = pad?.bottom ?? HOLE_PAD;
  const padLeft = pad?.left ?? HOLE_PAD;
  const hx = rect ? Math.max(RING_INSET, rect.x - padLeft) : 0;
  const hy = rect ? Math.max(RING_INSET, rect.y - padTop) : 0;
  const hole = rect
    ? {
        x: hx,
        y: hy,
        w: Math.min(W - RING_INSET, rect.x + rect.w + padRight) - hx,
        h: Math.min(H - RING_INSET, rect.y + rect.h + padBottom) - hy,
      }
    : null;

  const cardWidth = Math.min(W - 32, CARD_MAX_W);
  let cardPos: { top?: number; bottom?: number } = {};
  if (hole) {
    const below = hole.y + hole.h + 12;
    const spaceBelow = H - insets.bottom - below;
    const spaceAbove = hole.y - insets.top - 12;
    cardPos =
      spaceBelow >= cardH || spaceBelow >= spaceAbove
        ? { top: Math.min(below, H - insets.bottom - cardH - 8) }
        : { bottom: H - hole.y + 12 };
  }

  return (
    <View
      ref={rootRef}
      collapsable={false}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      style={[StyleSheet.absoluteFill, styles.root]}>
      <View style={StyleSheet.absoluteFill}>
        {hole ? (
          <>
            <View style={[styles.dim, { left: 0, top: 0, width: W, height: hole.y }]} />
            <View
              style={[styles.dim, { left: 0, top: hole.y + hole.h, width: W, height: H }]}
            />
            <View style={[styles.dim, { left: 0, top: hole.y, width: hole.x, height: hole.h }]} />
            <View
              style={[
                styles.dim,
                { left: hole.x + hole.w, top: hole.y, width: W, height: hole.h },
              ]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.ring,
                { left: hole.x, top: hole.y, width: hole.w, height: hole.h },
              ]}
            />
          </>
        ) : (
          <View style={[styles.dim, StyleSheet.absoluteFill]} />
        )}

        {ready ? (
        <View
          style={[
            styles.cardWrap,
            hole ? cardPos : styles.cardCentered,
            { width: cardWidth, left: (W - cardWidth) / 2 },
          ]}>
          <View style={styles.card} onLayout={(e) => setCardH(e.nativeEvent.layout.height)}>
            <Text style={styles.stepCount}>
              {stepIndex + 1} / {visibleSteps.length}
            </Text>
            <Text style={styles.title}>{step.title}</Text>
            <Text style={styles.body}>{step.body}</Text>
            <View style={styles.actions}>
              {isLast ? (
                <View style={styles.skipSpacer} />
              ) : (
                <Pressable onPress={onFinish} hitSlop={8} accessibilityRole="button">
                  <Text style={styles.skip}>Skip</Text>
                </Pressable>
              )}
              <View style={styles.navRow}>
                {stepIndex > 0 ? (
                  <Pressable
                    onPress={() => goTo(stepIndex - 1)}
                    style={[styles.btn, styles.btnGhost]}
                    accessibilityRole="button">
                    <Text style={styles.btnGhostText}>Back</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => (isLast ? onFinish() : goTo(stepIndex + 1))}
                  style={[styles.btn, styles.btnPrimary]}
                  accessibilityRole="button">
                  <Text style={styles.btnPrimaryText}>{isLast ? 'Done' : 'Next'}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles((c, scheme) => ({
  root: { zIndex: 1000, elevation: 1000 },
  dim: { position: 'absolute', backgroundColor: DIM },
  ring: {
    position: 'absolute',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: c.accent,
  },
  cardWrap: { position: 'absolute' },
  cardCentered: { top: '34%' },
  card: {
    backgroundColor: c.raised,
    borderRadius: 16,
    padding: 18,
    gap: 6,
    ...(scheme === 'dark' ? { borderWidth: StyleSheet.hairlineWidth, borderColor: c.border } : null),
  },
  stepCount: { color: c.textMuted, fontSize: 12, fontWeight: '600' },
  title: { color: c.text, fontSize: 17, fontWeight: '700' },
  body: { color: c.textSecondary, fontSize: 14, lineHeight: 20 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  skipSpacer: { width: 1 },
  skip: { color: c.textMuted, fontSize: 14, fontWeight: '500' },
  navRow: { flexDirection: 'row', gap: 8 },
  btn: { paddingVertical: 9, paddingHorizontal: 18, borderRadius: 10 },
  btnPrimary: { backgroundColor: c.accentFill },
  btnPrimaryText: { color: c.onAccent, fontSize: 14, fontWeight: '600' },
  btnGhost: { backgroundColor: c.fillStrong },
  btnGhostText: { color: c.text, fontSize: 14, fontWeight: '600' },
}));
