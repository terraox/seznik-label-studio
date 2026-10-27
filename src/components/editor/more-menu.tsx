import { router } from 'expo-router';
import { AppIcon, type AppIconName } from '@/components/app-icon';
import { Alert, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, cardElevation, themedStyles, useThemeRefresh } from '@/theme';

type IconName = AppIconName;

const MENU_EDGE = 8;

type LabelSettingsMenuProps = {
  visible: boolean;
  topOffset: number;
  onClose: () => void;
  onLabelSettings?: () => void;
  onOpen?: () => void;
  onSave?: () => void;
  onSaveAs?: () => void;
  onShare?: () => void;
  onUpload?: () => void;
};

export function LabelSettingsMenu({
  visible,
  topOffset,
  onClose,
  onLabelSettings,
  onOpen,
  onSave,
  onSaveAs,
  onShare,
  onUpload,
}: LabelSettingsMenuProps) {
  useThemeRefresh();
  const MENU_ITEMS: { label: string; icon: IconName; onPress?: () => void }[] = [
    {
      label: 'Label Settings',
      icon: 'hexagon',
      onPress: onLabelSettings ?? (() => router.push('/label-settings')),
    },
    {
      label: 'Editing Settings',
      icon: 'square.and.pencil',
      onPress: () => router.push('/editor-settings'),
    },
    {
      label: 'New',
      icon: 'plus.square',
      onPress: () => router.push('/new-label-setup'),
    },
    {
      label: 'Open',
      icon: 'folder',
      onPress: onOpen ?? (() => Alert.alert('Open', 'Open a saved label file.')),
    },
    {
      label: 'Save',
      icon: 'tray.and.arrow.down',
      onPress: onSave ?? (() => Alert.alert('Save', 'Label saved.')),
    },
    {
      label: 'Save As',
      icon: 'square.and.arrow.down.on.square',
      onPress: onSaveAs ?? (() => Alert.alert('Save As', 'Save label with a new name.')),
    },
    {
      label: 'Share',
      icon: 'square.and.arrow.up',
      onPress: onShare ?? (() => router.push('/share')),
    },
    {
      label: 'Upload',
      icon: 'icloud.and.arrow.up',
      onPress: onUpload ?? (() => Alert.alert('Upload', 'Upload label to cloud.')),
    },
  ];

  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const menuWidth = Math.min(Math.max(width * 0.46, 200), 260);
  // Keep the menu fully on screen: never taller than the space below its anchor; it scrolls
  // when short (landscape).
  const maxMenuHeight = Math.max(120, height - topOffset - Math.max(insets.bottom, MENU_EDGE) - MENU_EDGE);

  if (!visible) return null;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View
        style={[
          styles.menu,
          {
            top: topOffset,
            width: menuWidth,
            maxHeight: maxMenuHeight,
          },
        ]}>
        <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
          {MENU_ITEMS.map((item, index) => (
            <Pressable
              key={item.label}
              onPress={() => {
                onClose();
                item.onPress?.();
              }}
              style={({ pressed }) => [
                styles.menuRow,
                index < MENU_ITEMS.length - 1 && styles.menuRowBorder,
                pressed && styles.pressed,
              ]}>
              <View style={styles.menuIconWrap}>
                <AppIcon name={item.icon} tintColor={C.textSecondary} size={20} />
              </View>
              <Text style={styles.menuLabel}>{item.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

/** @deprecated Use LabelSettingsMenu */
export const MoreMenu = LabelSettingsMenu;

const styles = themedStyles((c, scheme) => ({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: c.pressedOverlay,
  },
  menu: {
    position: 'absolute',
    left: MENU_EDGE,
    backgroundColor: c.surface,
    borderRadius: 12,
    overflow: 'hidden',
    ...cardElevation(c, scheme),
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    minHeight: 46,
  },
  menuRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.hairline,
  },
  menuIconWrap: {
    width: 28,
    alignItems: 'center',
  },
  menuLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: c.text,
  },
  pressed: {
    opacity: 0.65,
  },
}));
