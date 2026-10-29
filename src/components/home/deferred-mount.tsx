import { type ReactNode, useEffect, useState } from 'react';
import { InteractionManager, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { useWalkthroughStore } from '@/stores/walkthrough-store';

/**
 * Mounts heavy children (lots of SVG art) one beat after the screen first paints, so the screen
 * opens straight away and the rest fades in. Holds `minHeight` meanwhile so nothing jumps.
 */
export function DeferredMount({ children, minHeight }: { children: ReactNode; minHeight: number }) {
  const [ready, setReady] = useState(false);
  // The tour points at these sections, so they must exist before it measures them.
  const touring = useWalkthroughStore((s) => s.active);
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => setReady(true));
    return () => task.cancel();
  }, []);
  if (!ready && !touring) return <View style={{ minHeight }} />;
  return <Animated.View entering={FadeIn.duration(180)}>{children}</Animated.View>;
}
