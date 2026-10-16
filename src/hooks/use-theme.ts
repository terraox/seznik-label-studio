/**
 * Template colours (`Colors` in constants/theme) for ThemedText / ThemedView / Collapsible.
 * Follows the app's Appearance setting (src/theme), not just the system.
 */

import { Colors } from '@/constants/theme';
import { useScheme } from '@/theme';

export function useTheme() {
  return Colors[useScheme()];
}
