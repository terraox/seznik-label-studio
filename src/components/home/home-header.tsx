import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StatusChip } from '@/components/home/status-chip';
import { WalkthroughTarget } from '@/components/walkthrough/walkthrough-target';
import { Spacing } from '@/constants/theme';
import { HomeLayout, Palette } from '@/constants/ui';

export function HomeHeader() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
      <WalkthroughTarget id="home.printer">
        <StatusChip />
      </WalkthroughTarget>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: Palette.header,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: HomeLayout.screenPad,
    paddingBottom: Spacing.three,
  },
});
