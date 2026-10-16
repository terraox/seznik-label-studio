import { View } from 'react-native';
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
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: HomeLayout.screenPad,
    paddingBottom: Spacing.three,
  },
}));
