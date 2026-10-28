import type { ReactNode } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { AppIcon } from '@/components/app-icon';
import { ALL_ORIENTATIONS } from '@/lib/layout/screen-sizes';
import { C, cardElevation, themedStyles, useThemeRefresh } from '@/theme';

/** A large preview of one template, opened by a long press, with Open and Favourite. */
export function TemplateQuickView({
  visible,
  title,
  size,
  isFavorite,
  onClose,
  onOpen,
  onToggleFavorite,
  children,
}: {
  visible: boolean;
  title: string;
  size: string;
  isFavorite: boolean;
  onClose: () => void;
  onOpen: () => void;
  onToggleFavorite: () => void;
  children: ReactNode;
}) {
  useThemeRefresh();
  return (
    <Modal supportedOrientations={ALL_ORIENTATIONS} visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(160)} style={styles.scrim}>
        <Pressable style={styles.scrimTap} onPress={onClose} accessibilityLabel="Close preview" />
        <Animated.View entering={ZoomIn.duration(200)} style={styles.card}>
          <View style={styles.head}>
            <View style={styles.headCopy}>
              <Text numberOfLines={2} style={styles.title}>
                {title}
              </Text>
              <Text style={styles.size}>{size}</Text>
            </View>
            <Pressable hitSlop={10} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" style={styles.close}>
              <AppIcon name="xmark" tintColor={C.textMuted} size={16} />
            </Pressable>
          </View>
          <View style={styles.stage} pointerEvents="none">
            {children}
          </View>
          <View style={styles.actions}>
            <Pressable
              onPress={onToggleFavorite}
              accessibilityRole="button"
              accessibilityLabel={isFavorite ? 'Remove from favourites' : 'Add to favourites'}
              style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
              <AppIcon name={isFavorite ? 'star.fill' : 'star'} tintColor={isFavorite ? C.warning : C.textSecondary} size={18} />
              <Text style={styles.secondaryText}>{isFavorite ? 'Saved' : 'Favourite'}</Text>
            </Pressable>
            <Pressable
              onPress={onOpen}
              accessibilityRole="button"
              style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
              <Text style={styles.primaryText}>Open</Text>
              <AppIcon name="chevron.right" tintColor={C.onAccent} size={14} />
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = themedStyles((c, scheme) => ({
  scrim: {
    flex: 1,
    backgroundColor: c.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  scrimTap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 20,
    backgroundColor: c.surface,
    overflow: 'hidden',
    ...cardElevation(c, scheme),
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  headCopy: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 17, fontWeight: '700', color: c.text },
  size: { fontSize: 13, fontWeight: '600', color: c.textMuted },
  close: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  stage: { backgroundColor: c.canvasArea },
  actions: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
  },
  secondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: c.fill,
  },
  secondaryText: { fontSize: 15, fontWeight: '600', color: c.text },
  primary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: c.accentFill,
  },
  primaryText: { fontSize: 15, fontWeight: '700', color: c.onAccent },
  pressed: { opacity: 0.85 },
}));
