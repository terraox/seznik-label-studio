import { useMemo, useRef } from 'react';
import { Platform, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

import { ToolMenuIcon } from '@/components/editor/editor-menu-icons';
import type { AppIconName } from '@/components/app-icon';
import { themedStyles, useThemeRefresh } from '@/theme';

const DRAG_START_PX = 10;

export function PaletteToolItem({
  icon: _icon,
  label,
  onPress,
  onDragStart,
  onDragMove,
  onDragEnd,
  style,
}: {
  icon: AppIconName;
  label: string;
  onPress: () => void;
  onDragStart: (windowX: number, windowY: number) => void;
  onDragMove: (windowX: number, windowY: number) => void;
  onDragEnd: (windowX: number, windowY: number) => void;
  style?: StyleProp<ViewStyle>;
}) {
  useThemeRefresh();
  const callbacksRef = useRef({ onPress, onDragStart, onDragMove, onDragEnd });
  callbacksRef.current = { onPress, onDragStart, onDragMove, onDragEnd };

  const gesture = useMemo(() => {
    const fireStart = (x: number, y: number) => callbacksRef.current.onDragStart(x, y);
    const fireMove = (x: number, y: number) => callbacksRef.current.onDragMove(x, y);
    const fireEnd = (x: number, y: number) => callbacksRef.current.onDragEnd(x, y);
    const firePress = () => callbacksRef.current.onPress();
    // Long-press before drag so a short vertical pan can scroll the tool menu when the
    // sheet is shorter than the palette. Tap still adds a tool immediately.
    const pan = Gesture.Pan()
      .activateAfterLongPress(160)
      .minDistance(DRAG_START_PX)
      .maxPointers(1)
      .shouldCancelWhenOutside(false)
      .onStart((e) => {
        runOnJS(fireStart)(e.absoluteX, e.absoluteY);
      })
      .onUpdate((e) => {
        runOnJS(fireMove)(e.absoluteX, e.absoluteY);
      })
      .onFinalize((e) => {
        runOnJS(fireEnd)(e.absoluteX, e.absoluteY);
      });
    const tap = Gesture.Tap()
      .maxDistance(DRAG_START_PX)
      .onEnd((_e, success) => {
        if (success) runOnJS(firePress)();
      });
    return Gesture.Exclusive(pan, tap);
  }, []);

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={[styles.hit, style, Platform.OS === 'web' ? (webHitStyle as object) : null]}
        collapsable={false}>
        <ToolMenuIcon name={label} size={30} />
        <Text numberOfLines={1} style={styles.label}>
          {label}
        </Text>
      </View>
    </GestureDetector>
  );
}

const webHitStyle = {
  touchAction: 'none',
  userSelect: 'none',
} as const;

const styles = themedStyles((c) => ({
  hit: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '400',
    color: c.textSecondary,
    textAlign: 'center',
  },
}));
