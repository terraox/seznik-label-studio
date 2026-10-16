import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { makeStyles } from '@/theme';

const LOGO_FADE_MS = 500;
const BRAND_DELAY_MS = 500;
const TAGLINE_DELAY_MS = 1000;
const HOLD_MS = 2300;

function IndianFlag() {
  return (
    <View style={flag.root}>
      <View style={[flag.band, { backgroundColor: '#FF9933' }]} />
      <View style={[flag.band, flag.middle]}>
        <View style={flag.chakra} />
      </View>
      <View style={[flag.band, { backgroundColor: '#138808' }]} />
    </View>
  );
}

const flag = StyleSheet.create({
  root: { width: 27, height: 18, borderRadius: 2, overflow: 'hidden', marginLeft: 8 },
  band: { flex: 1 },
  middle: { backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  chakra: { width: 5, height: 5, borderRadius: 2.5, borderWidth: 1, borderColor: '#000080' },
});

/** Logo, "Seznik India" with the flag, then a tagline; then the app loads directly. */
export function IntroScreen({ onFinish, onDone }: { onFinish: () => void; onDone: () => void }) {
  const styles = useStyles();
  const logo = useRef(new Animated.Value(0)).current;
  const brand = useRef(new Animated.Value(0)).current;
  const tagline = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
    const fade = (v: Animated.Value, delay: number) =>
      Animated.timing(v, { toValue: 1, duration: LOGO_FADE_MS, delay, useNativeDriver: true });
    const sequence = Animated.parallel([
      fade(logo, 0),
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
  }, [logo, brand, tagline, onFinish, onDone]);

  return (
    <View style={[StyleSheet.absoluteFill, styles.root]}>
      <View style={styles.center}>
        <Animated.View style={{ opacity: logo }}>
          <Image
            source={require('../../assets/images/logo.png')}
            style={styles.logo}
            contentFit="contain"
          />
        </Animated.View>
        <Animated.View style={[styles.brandRow, { opacity: brand }]}>
          <Text style={styles.brand}>SEZNIK INDIA</Text>
        </Animated.View>
        <Animated.View style={[styles.brandRow, styles.taglineRow, { opacity: tagline }]}>
          <Text style={styles.tagline}>Made in India with love 💔</Text>
          <IndianFlag />
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
