import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, useWindowDimensions } from 'react-native';

import { makeStyles, useScheme, useSettingsHydrated } from '@/theme';

// Rendered from splash-remotion/ (`npm run render` in that folder). Same animation, drawn on the
// theme's own background, so neither theme shows the other one's backdrop.
const SPLASH_ANIMATION = {
  light: require('../../assets/images/splash-animation.webp'),
  dark: require('../../assets/images/splash-animation-dark.webp'),
};
// The WebP is ~3.0 s and plays once (loop count 1), then holds on its last frame.
const PLAY_MS = 3000;
const FADE_MS = 120;
// Hold on the finished logo for 0.6 s; the app mounts behind the opaque splash meanwhile, so the
// fade reveals a drawn home screen instead of a blank one.
const HANDOFF_MS = 600;
// If the image never reports loading (or the saved theme never arrives), don't leave the user
// stuck on the native splash.
const GIVE_UP_MS = 1500;

/** Plays the "label getting printed" logo animation over the app, then fades out. Tap to skip. */
export function AnimatedSplash({ onFinish, onDone }: { onFinish: () => void; onDone: () => void }) {
  const { width, height } = useWindowDimensions();
  const styles = useStyles();
  const scheme = useScheme();
  // Swapping the source mid-play would restart the WebP against a timer that is already running,
  // so the animation only starts once the saved theme is in and the choice is final.
  const themeReady = useSettingsHydrated();
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
    const fallback = setTimeout(start, GIVE_UP_MS);
    return () => clearTimeout(fallback);
  }, [start]);

  return (
    <Animated.View
      pointerEvents={blocking ? 'auto' : 'none'}
      style={[StyleSheet.absoluteFill, styles.root, { opacity }]}>
      <Pressable style={styles.fill} onPress={finish} disabled={!blocking}>
        {themeReady ? (
          <Image
            source={SPLASH_ANIMATION[scheme]}
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
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const useStyles = makeStyles((c) => ({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.splash,
    zIndex: 1000,
    elevation: 1000,
  },
  fill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
}));
