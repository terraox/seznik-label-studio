import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Palette } from '@/constants/ui';
import {
  measureWalkthroughTarget,
  scrollWalkthroughBy,
  type WindowRect,
} from '@/lib/walkthrough/registry';
import type { WalkthroughStep } from '@/lib/walkthrough/home-steps';
import { useWalkthroughStore } from '@/stores/walkthrough-store';

const DIM = 'rgba(10, 20, 32, 0.78)';
const HOLE_PAD = 6;
const CARD_MAX_W = 360;
const CARD_EST_H = 190;

export function WalkthroughOverlay({
  steps,
  onFinish,
}: {
  steps: readonly WalkthroughStep[];
  /** Called on Done or Skip. */
  onFinish: () => void;
}) {
  const active = useWalkthroughStore((s) => s.active);
  const stepIndex = useWalkthroughStore((s) => s.stepIndex);
  const goTo = useWalkthroughStore((s) => s.goTo);
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [rect, setRect] = useState<WindowRect | null>(null);
  const [cardH, setCardH] = useState(CARD_EST_H);
  const rootRef = useRef<View>(null);

  const visibleSteps = steps;
  const step = visibleSteps[stepIndex];
  const visible = active && focused && !!step;

  useEffect(() => {
    if (!visible) return;
    if (!step.target) {
      setRect(null);
      return;
    }
    let cancelled = false;
    const topBound = insets.top + 70;

    // Modal root origin: target coords are shifted by it so the cutout lines up
    // regardless of how the platform reports window offsets (status bar etc).
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
        return;
      }
      // Scroll steps: bring the target's top to just under the header so the card fits below it.
      if (step.scrolls && attempt < 2) {
        const dy = m.y - o.y - topBound;
        if (Math.abs(dy) > 4 && scrollWalkthroughBy(dy)) {
          setTimeout(() => !cancelled && void run(attempt + 1), 520);
          return;
        }
      }
      setRect({ x: m.x - o.x, y: m.y - o.y, w: m.w, h: m.h });
    };
    // Let the Modal / tab focus settle before measuring.
    const t = setTimeout(() => void run(0), 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [visible, step, insets.top]);

  if (!visible) return null;

  const isLast = stepIndex >= visibleSteps.length - 1;
  const hole = rect
    ? {
        x: Math.max(0, rect.x - HOLE_PAD),
        y: Math.max(0, rect.y - HOLE_PAD),
        w: rect.w + HOLE_PAD * 2,
        h: rect.h + HOLE_PAD * 2,
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
    <Modal transparent statusBarTranslucent animationType="fade" onRequestClose={onFinish}>
      <View ref={rootRef} collapsable={false} style={StyleSheet.absoluteFill}>
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
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: { position: 'absolute', backgroundColor: DIM },
  ring: {
    position: 'absolute',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Palette.accent,
  },
  cardWrap: { position: 'absolute' },
  cardCentered: { top: '34%' },
  card: {
    backgroundColor: Palette.card,
    borderRadius: 16,
    padding: 18,
    gap: 6,
  },
  stepCount: { color: Palette.muted, fontSize: 12, fontWeight: '600' },
  title: { color: Palette.ink, fontSize: 17, fontWeight: '700' },
  body: { color: Palette.actionText, fontSize: 14, lineHeight: 20 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  skipSpacer: { width: 1 },
  skip: { color: Palette.muted, fontSize: 14, fontWeight: '500' },
  navRow: { flexDirection: 'row', gap: 8 },
  btn: { paddingVertical: 9, paddingHorizontal: 18, borderRadius: 10 },
  btnPrimary: { backgroundColor: Palette.accent },
  btnPrimaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  btnGhost: { backgroundColor: '#EEF2F6' },
  btnGhostText: { color: Palette.ink, fontSize: 14, fontWeight: '600' },
});
