import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/** Feedback taps. Never throws: unsupported devices (web, no vibration motor) just stay silent. */
function run(fn: () => Promise<unknown>) {
  if (Platform.OS === 'web') return;
  try {
    void fn().catch(() => {});
  } catch {
    // module missing in an older dev build
  }
}

export const haptics = {
  /** Selecting an element or tab. */
  select: () => run(() => Haptics.selectionAsync()),
  /** Light tap for snapping to a guide or a divider. */
  snap: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Print sent, printer connected. */
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Print failed. */
  error: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  /** Printer disconnected. */
  warning: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};
