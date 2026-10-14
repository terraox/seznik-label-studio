import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, useWindowDimensions } from 'react-native';

// Rendered from splash-remotion/ (`npm run render` in that folder).
const SPLASH_ANIMATION = require('../../assets/images/splash-animation.webp');
const SPLASH_BACKGROUND = '#FEFEFE';
const PLAY_MS = 2900;
const FADE_MS = 120;
// After the animation ends the app mounts behind the still-opaque splash; give it a moment to
// draw its first frame so the fade reveals the home screen instead of a blank one.
const HANDOFF_MS = 350;

/** Plays the "label getting printed" logo animation over the app, then fades out. Tap to skip. */
export function AnimatedSplash({ onFinish, onDone }: { onFinish: () => void; onDone: () => void }) {
  const { width, height } = useWindowDimensions();
  const size = Math.min(width * 0.9, height * 0.6);
  const opacity = useRef(new Animated.Value(1)).current;
  const started = useRef(false);
  const finished = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [blocking, setBlocking] = useState(true);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    if (timer.current) clearTimeout(timer.current);
    // The animation is complete: only now let the app mount (behind the opaque splash).
    onFinish();
    setTimeout(() => {
      // Drop the hit target before the fade. A transparent overlay still eats taps,
      // and the native animation callback does not always run to unmount it.
      setBlocking(false);
      Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(() => {
        onDone();
      });
      setTimeout(onDone, FADE_MS + 40);
    }, HANDOFF_MS);
  }, [onFinish, onDone, opacity]);

  const start = useCallback(() => {
    if (started.current) return;
    started.current = true;
    SplashScreen.hideAsync().catch(() => {});
    timer.current = setTimeout(finish, PLAY_MS);
  }, [finish]);

  useEffect(() => {
    // If the image never reports loading, don't leave the user stuck on the native splash.
    const fallback = setTimeout(start, 800);
    return () => clearTimeout(fallback);
  }, [start]);

  return (
    <Animated.View
      pointerEvents={blocking ? 'auto' : 'none'}
      style={[StyleSheet.absoluteFill, styles.root, { opacity }]}>
      <Pressable style={styles.fill} onPress={finish} disabled={!blocking}>
        <Image
          source={SPLASH_ANIMATION}
          style={{ width: size, height: size }}
          contentFit="contain"
          autoplay
          cachePolicy="memory"
          onLoad={start}
          onError={() => {
            start();
            finish();
          }}
        />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SPLASH_BACKGROUND,
    zIndex: 1000,
    elevation: 1000,
  },
  fill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
});
