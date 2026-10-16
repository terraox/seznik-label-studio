import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { makeStyles } from '@/theme';

export type ActionSheetItem = {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  /** Shows a check mark (current choice). */
  selected?: boolean;
};

type ActionSheetProps = {
  visible: boolean;
  onClose: () => void;
  items: ActionSheetItem[];
};

export function ActionSheet({ visible, onClose, items }: ActionSheetProps) {
  const insets = useSafeAreaInsets();
  const styles = useStyles();

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
                    {item.selected ? '✓  ' : ''}
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

const useStyles = makeStyles((c) => ({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: c.scrim,
  },
  bottom: {
    paddingHorizontal: 10,
    gap: 8,
  },
  sheet: {
    backgroundColor: c.raised,
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
    color: c.link,
  },
  destructive: {
    color: c.danger,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: c.hairline,
  },
  cancel: {
    backgroundColor: c.raised,
    borderRadius: 14,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 17,
    fontWeight: '600',
    color: c.link,
  },
  pressed: {
    opacity: 0.65,
  },
}));
