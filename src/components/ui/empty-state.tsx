import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { AppIcon, type AppIconName } from '@/components/app-icon';
import { C, themedStyles, useThemeRefresh } from '@/theme';

/** An icon, one line and an optional hint, for screens that have nothing to show. */
export function EmptyState({
  icon,
  title,
  hint,
  children,
}: {
  icon: AppIconName;
  title: string;
  hint?: string;
  children?: ReactNode;
}) {
  useThemeRefresh();
  return (
    <View style={styles.wrap} accessibilityRole="text">
      <View style={styles.iconCircle}>
        <AppIcon name={icon} tintColor={C.textMuted} size={26} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {children}
    </View>
  );
}

const styles = themedStyles((c) => ({
  wrap: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: c.fill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: c.text,
    textAlign: 'center',
  },
  hint: {
    fontSize: 13.5,
    lineHeight: 19,
    color: c.textMuted,
    textAlign: 'center',
  },
}));
