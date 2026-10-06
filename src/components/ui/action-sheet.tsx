import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Palette } from '@/constants/ui';

export type ActionSheetItem = {
  label: string;
  onPress: () => void;
  destructive?: boolean;
};

type ActionSheetProps = {
  visible: boolean;
  onClose: () => void;
  items: ActionSheetItem[];
};

export function ActionSheet({ visible, onClose, items }: ActionSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.bottom, { paddingBottom: insets.bottom + 10 }]}>
          <View style={styles.sheet}>
            {items.map((item, index) => (
              <View key={item.label}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <Pressable
                  onPress={() => {
                    // Run the action first so callers can set flags before close.
                    item.onPress();
                    onClose();
                  }}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                  <Text
                    style={[styles.rowText, item.destructive && styles.destructive]}>
                    {item.label}
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  bottom: {
    paddingHorizontal: 10,
    gap: 8,
  },
  sheet: {
    backgroundColor: Palette.card,
    borderRadius: 14,
    overflow: 'hidden',
  },
  row: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  rowText: {
    fontSize: 17,
    fontWeight: '400',
    color: '#007AFF',
  },
  destructive: {
    color: Palette.danger,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E3E6EA',
  },
  cancel: {
    backgroundColor: Palette.card,
    borderRadius: 14,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#007AFF',
  },
  pressed: {
    opacity: 0.65,
  },
});
