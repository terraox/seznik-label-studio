import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StatusChip } from '@/components/home/status-chip';
import { WalkthroughTarget } from '@/components/walkthrough/walkthrough-target';
import { Spacing } from '@/constants/theme';
import { HomeLayout } from '@/constants/ui';
import { themedStyles, useThemeRefresh } from '@/theme';

export function HomeHeader() {
  useThemeRefresh();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
      <View style={styles.brand}>
        <View style={styles.mark} />
        <Text style={styles.wordmark}>SEZNIK</Text>
        <Text numberOfLines={1} style={styles.sub}>LABEL STUDIO</Text>
      </View>
      <WalkthroughTarget id="home.printer">
        <StatusChip />
      </WalkthroughTarget>
    </View>
  );
}

const styles = themedStyles((c) => ({
  header: {
    backgroundColor: c.header,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: HomeLayout.screenPad,
    paddingBottom: Spacing.three,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  brand: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  mark: { width: 4, height: 20, borderRadius: 2, backgroundColor: '#7CCBF0' }, // theme-fixed: sky tick on the dark header
  wordmark: { color: c.onHeader, fontSize: 18, fontWeight: '800', letterSpacing: 2.2 },
  sub: { flexShrink: 1, color: c.onHeader, opacity: 0.55, fontSize: 12, fontWeight: '600', letterSpacing: 1.8, marginTop: 2 },
}));
