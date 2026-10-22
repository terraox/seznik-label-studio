import { goBack } from '@/lib/go-back';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { androidRipple } from '@/constants/ui';
import { headerBar, makeStyles, useColors } from '@/theme';

export function SettingsStackHeader({
  title,
  rightLabel,
  onRightPress,
}: {
  title: string;
  rightLabel?: string;
  onRightPress?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const c = useColors();
  const styles = useStyles();

  const sideWidth = rightLabel && onRightPress ? 64 : 36;

  return (
    <View style={[styles.header, { paddingTop: insets.top + Spacing.one }]}>
      <Pressable
        onPress={() => goBack()}
        hitSlop={12}
        android_ripple={androidRipple}
        style={({ pressed }) => [
          styles.backBtn,
          { width: sideWidth, alignItems: sideWidth === 36 ? 'center' : 'flex-start' },
          pressed && styles.pressed,
        ]}>
        <AppIcon name="chevron.left" tintColor={c.onHeader} size={22} />
      </Pressable>
      <Text style={styles.title}>{title}</Text>
      {rightLabel && onRightPress ? (
        <Pressable
          onPress={onRightPress}
          hitSlop={8}
          android_ripple={androidRipple}
          style={({ pressed }) => [styles.rightBtn, { width: sideWidth }, pressed && styles.pressed]}>
          <Text style={styles.rightLabel}>{rightLabel}</Text>
        </Pressable>
      ) : (
        <View style={[styles.spacer, { width: sideWidth }]} />
      )}
    </View>
  );
}

const useStyles = makeStyles((c, scheme) => ({
  header: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    ...headerBar(c, scheme),
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.three,
    minHeight: 52,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    color: c.onHeader,
    fontSize: 17,
    fontWeight: '600',
  },
  spacer: {
    width: 36,
  },
  rightBtn: {
    width: 64,
    height: 36,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  rightLabel: {
    color: c.onHeader,
    fontSize: 16,
    fontWeight: '500',
  },
  pressed: {
    opacity: 0.65,
  },
}));
