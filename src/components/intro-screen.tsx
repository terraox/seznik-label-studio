import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { makeStyles } from '@/theme';

const FADE_MS = 250;
const BRAND_DELAY_MS = 250;
const TAGLINE_DELAY_MS = 500;
// Total time on screen before the app loads.
const HOLD_MS = 1500;

/** Logo, "SEZNIK INDIA", then a tagline; then the app loads directly. */
export function IntroScreen({ onFinish, onDone }: { onFinish: () => void; onDone: () => void }) {
  const styles = useStyles();
  const brand = useRef(new Animated.Value(0)).current;
  const tagline = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
    const fade = (v: Animated.Value, delay: number) =>
      Animated.timing(v, { toValue: 1, duration: FADE_MS, delay, useNativeDriver: true });
    const sequence = Animated.parallel([
      fade(brand, BRAND_DELAY_MS),
      fade(tagline, TAGLINE_DELAY_MS),
    ]);
    sequence.start();
    const doneTimer = setTimeout(() => {
      onFinish();
      onDone();
    }, HOLD_MS);
    return () => {
      sequence.stop();
      clearTimeout(doneTimer);
    };
  }, [brand, tagline, onFinish, onDone]);

  return (
    <View style={[StyleSheet.absoluteFill, styles.root]}>
      <View style={styles.center}>
        <Image
          source={require('../../assets/images/logo.png')}
          style={styles.logo}
          contentFit="contain"
          priority="high"
          cachePolicy="memory"
        />
        <Animated.View style={[styles.brandRow, { opacity: brand }]}>
          <Text style={styles.brand}>SEZNIK INDIA</Text>
        </Animated.View>
        <Animated.View style={[styles.brandRow, styles.taglineRow, { opacity: tagline }]}>
          <Text style={styles.tagline}>Made in India 🇮🇳 with love ♥️</Text>
        </Animated.View>
      </View>
    </View>
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
  center: { alignItems: 'center' },
  logo: { width: 180, height: 180, borderRadius: 36 },
  brandRow: { flexDirection: 'row', alignItems: 'center', marginTop: 24 },
  brand: { fontSize: 26, fontWeight: '800', letterSpacing: 4, color: c.text },
  taglineRow: { marginTop: 14 },
  tagline: { fontSize: 20, fontWeight: '600', color: c.textSecondary },
}));
