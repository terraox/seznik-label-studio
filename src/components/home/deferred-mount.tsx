import { type ReactNode, useEffect, useState } from 'react';
import { InteractionManager, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

/**
 * Mounts heavy children (lots of SVG art) one beat after the screen first paints, so the screen
 * opens straight away and the rest fades in. Holds `minHeight` meanwhile so nothing jumps.
 */
export function DeferredMount({ children, minHeight }: { children: ReactNode; minHeight: number }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => setReady(true));
    return () => task.cancel();
  }, []);
  if (!ready) return <View style={{ minHeight }} />;
  return <Animated.View entering={FadeIn.duration(180)}>{children}</Animated.View>;
}
