import { AppIcon } from '@/components/app-icon';
import { useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import {
  SIGNATURE_INK,
  denormalizeStrokes,
  pointsToPath,
  type SignatureStroke,
} from '@/components/editor/signature-preview';
import { C, themedStyles, useThemeRefresh } from '@/theme';

export type { SignaturePoint, SignatureStroke } from '@/components/editor/signature-preview';
export { SignaturePreview } from '@/components/editor/signature-preview';

type SignatureDrawingBoardProps = {
  onCancel: () => void;
  onConfirm: (strokes: SignatureStroke[]) => void;
  initialStrokes?: SignatureStroke[];
};

const BRUSH_WIDTHS = [2.5, 3.5, 4.5, 5.5, 6.5, 7.5];
const BRUSH_DOT_SIZES = [8, 10, 12, 14, 16, 18];

function cloneStrokes(strokes: SignatureStroke[]) {
  return strokes.map((stroke) => ({
    strokeWidth: stroke.strokeWidth,
    points: stroke.points.map((point) => ({ ...point })),
  }));
}

function normalizeStrokes(strokes: SignatureStroke[], width: number, height: number): SignatureStroke[] {
  if (width <= 0 || height <= 0) return strokes;

  return strokes.map((stroke) => ({
    strokeWidth: stroke.strokeWidth / width,
    points: stroke.points.map((point) => ({
      x: point.x / width,
      y: point.y / height,
    })),
  }));
}

export function SignatureDrawingBoard({
  onCancel,
  onConfirm,
  initialStrokes = [],
}: SignatureDrawingBoardProps) {
  useThemeRefresh();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const modalWidth = Math.min(screenWidth - 24, screenWidth);
  const canvasSize = Math.min(modalWidth - 32, 320);

  const canvasSizeRef = useRef({ width: canvasSize, height: canvasSize });
  canvasSizeRef.current = { width: canvasSize, height: canvasSize };

  const [brushIndex, setBrushIndex] = useState(1);
  const [strokes, setStrokes] = useState<SignatureStroke[]>(() =>
    denormalizeStrokes(initialStrokes, canvasSize, canvasSize),
  );
  const [redoStack, setRedoStack] = useState<SignatureStroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<SignatureStroke | null>(null);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          const { locationX, locationY } = event.nativeEvent;
          setCurrentStroke({
            strokeWidth: BRUSH_WIDTHS[brushIndex],
            points: [{ x: locationX, y: locationY }],
          });
          setRedoStack([]);
        },
        onPanResponderMove: (event) => {
          const { locationX, locationY } = event.nativeEvent;
          setCurrentStroke((prev) =>
            prev
              ? {
                  ...prev,
                  points: [...prev.points, { x: locationX, y: locationY }],
                }
              : null,
          );
        },
        onPanResponderRelease: () => {
          setCurrentStroke((prev) => {
            if (prev && prev.points.length > 0) {
              setStrokes((existing) => [...existing, prev]);
            }
            return null;
          });
        },
        onPanResponderTerminate: () => {
          setCurrentStroke(null);
        },
      }),
    [brushIndex],
  );

  const renderedStrokes = currentStroke ? [...strokes, currentStroke] : strokes;

  const handleUndo = () => {
    setStrokes((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.slice(0, -1);
      setRedoStack((redo) => [prev[prev.length - 1], ...redo]);
      return next;
    });
  };

  const handleRedo = () => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const [stroke, ...rest] = prev;
      setStrokes((existing) => [...existing, stroke]);
      return rest;
    });
  };

  const handleConfirm = () => {
    const { width, height } = canvasSizeRef.current;
    onConfirm(normalizeStrokes(strokes, width, height));
  };

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable style={styles.backdrop} onPress={onCancel} />

      <View
        style={[
          styles.stack,
          {
            width: screenWidth,
            paddingBottom: Math.max(12, insets.bottom),
            paddingHorizontal: 12,
          },
        ]}>
        <View style={styles.modal}>
          <View style={styles.headerRow}>
            <Pressable
              onPress={handleUndo}
              disabled={strokes.length === 0}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}>
              <AppIcon
                name="arrow.uturn.backward"
                tintColor={strokes.length === 0 ? C.textDisabled : C.link}
                size={22}
              />
            </Pressable>

            <Text style={styles.title}>Drawing board</Text>

            <Pressable
              onPress={handleRedo}
              disabled={redoStack.length === 0}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}>
              <AppIcon
                name="arrow.uturn.forward"
                tintColor={redoStack.length === 0 ? C.textDisabled : C.link}
                size={22}
              />
            </Pressable>
          </View>

          <View style={styles.brushRow}>
            {BRUSH_DOT_SIZES.map((size, index) => {
              const active = index === brushIndex;
              return (
                <Pressable
                  key={`brush-${index}`}
                  onPress={() => setBrushIndex(index)}
                  hitSlop={8}
                  style={({ pressed }) => [styles.brushHit, pressed && styles.pressed]}>
                  <View
                    style={[
                      styles.brushDot,
                      {
                        width: size,
                        height: size,
                        borderRadius: size / 2,
                        backgroundColor: active ? C.danger : C.link,
                      },
                    ]}
                  />
                </Pressable>
              );
            })}
          </View>

          <View
            style={[styles.canvas, { width: canvasSize, height: canvasSize }]}
            {...panResponder.panHandlers}>
            <Svg width={canvasSize} height={canvasSize}>
              {renderedStrokes.map((stroke, index) => (
                <Path
                  key={`stroke-${index}`}
                  d={pointsToPath(stroke.points)}
                  stroke={SIGNATURE_INK}
                  strokeWidth={stroke.strokeWidth}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
            </Svg>
          </View>
        </View>

        <View style={styles.footerRow}>
          <Pressable
            onPress={onCancel}
            style={({ pressed }) => [styles.footerBtn, pressed && styles.pressed]}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>

          <Pressable
            onPress={handleConfirm}
            style={({ pressed }) => [styles.footerBtn, pressed && styles.pressed]}>
            <Text style={styles.confirmText}>Confirm</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = themedStyles((c) => ({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'flex-end',
    zIndex: 60,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: c.scrim,
  },
  stack: {
    zIndex: 61,
    alignItems: 'stretch',
    gap: 12,
  },
  modal: {
    backgroundColor: c.surface,
    borderRadius: 16,
    width: '100%',
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '500',
    color: c.textMuted,
  },
  brushRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginBottom: 14,
  },
  brushHit: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brushDot: {
    backgroundColor: c.link,
  },
  canvas: {
    alignSelf: 'center',
    backgroundColor: '#FFFFFF', // theme-fixed: light preview (canvas)
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E4E8ED', // theme-fixed: light preview (canvas)
  },
  footerRow: {
    flexDirection: 'row',
    gap: 12,
  },
  footerBtn: {
    flex: 1,
    minHeight: 52,
    borderRadius: 10,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: c.link,
  },
  confirmText: {
    fontSize: 16,
    fontWeight: '600',
    color: c.danger,
  },
  pressed: {
    opacity: 0.68,
  },
}));
