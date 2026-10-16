import { ActivityIndicator, Text, View } from 'react-native';

import type { PdfCropOverlay } from '@/components/pdf-editor/use-smart-crop';
import { C, themedStyles, useThemeRefresh } from '@/theme';

/**
 * Smart Crop section outlines on the crop view. Purely visual: they never take
 * touches — a tap anywhere goes to the stage gesture, which hit-tests in page
 * coordinates. Screen readers get each one as a button (plan §5.6).
 */
export function PdfSectionOverlays({
  overlays,
  stageW,
  stageH,
  onActivate,
}: {
  overlays: PdfCropOverlay[];
  stageW: number;
  stageH: number;
  /** Screen-reader activation of an overlay. */
  onActivate?: (id: string) => void;
}) {
  useThemeRefresh();
  return (
    <>
      {overlays.map((o) => {
        const style =
          o.state === 'selected' ? styles.selected : o.state === 'suggested' ? styles.suggested : styles.hint;
        return (
          <View
            key={o.id}
            pointerEvents="none"
            accessible
            accessibilityRole="button"
            accessibilityLabel={o.a11yLabel}
            accessibilityActions={onActivate ? [{ name: 'activate' }] : undefined}
            onAccessibilityAction={onActivate ? () => onActivate(o.id) : undefined}
            style={[
              styles.box,
              style,
              { left: o.rect.x * stageW, top: o.rect.y * stageH, width: o.rect.w * stageW, height: o.rect.h * stageH },
            ]}>
            {o.number != null || o.label ? (
              <View style={[styles.badge, o.state === 'selected' ? styles.badgeSelected : styles.badgeQuiet]}>
                <Text
                  numberOfLines={1}
                  style={[styles.badgeText, o.state === 'selected' ? styles.badgeTextSelected : styles.badgeTextQuiet]}>
                  {o.label ?? String(o.number)}
                </Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </>
  );
}

/** Small spinner where a tap is waiting for the page to be read. */
export function PdfTapBusy({ at, stageW, stageH }: { at: { x: number; y: number }; stageW: number; stageH: number }) {
  useThemeRefresh();
  return (
    <View pointerEvents="none" style={[styles.busy, { left: at.x * stageW - 14, top: at.y * stageH - 14 }]}>
      <ActivityIndicator size="small" color={C.accent} />
    </View>
  );
}

const styles = themedStyles((c) => ({
  box: { position: 'absolute', borderRadius: 3 },
  hint: { borderWidth: 1, borderColor: c.accent, opacity: 0.55 },
  suggested: { borderWidth: 1.5, borderColor: c.accent, borderStyle: 'dashed' },
  selected: { borderWidth: 2, borderColor: c.accent, backgroundColor: c.accentSoft },
  badge: {
    position: 'absolute',
    top: 2,
    left: 2,
    maxWidth: 160,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  badgeSelected: { backgroundColor: c.accentFill },
  badgeQuiet: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.accent },
  badgeText: { fontSize: 10, fontWeight: '800' },
  badgeTextSelected: { color: c.onAccent },
  badgeTextQuiet: { color: c.accentInk },
  busy: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.surface,
  },
}));
