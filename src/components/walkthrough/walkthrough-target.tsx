import { type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { registerWalkthroughTarget } from '@/lib/walkthrough/registry';

export function WalkthroughTarget({
  id,
  style,
  children,
}: {
  id: string;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  return (
    <View
      ref={(node) => registerWalkthroughTarget(id, node)}
      collapsable={false}
      style={style}>
      {children}
    </View>
  );
}
