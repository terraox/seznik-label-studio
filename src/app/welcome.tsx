import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GridBackground } from '@/components/grid-background';
import { LegalModal } from '@/components/welcome/legal-modal';
import { WelcomeButton } from '@/components/welcome/welcome-button';
import { welcomePalette } from '@/components/welcome/welcome-palette';
import type { LegalDocId } from '@/lib/legal-text';
import { useScheme } from '@/theme';

/** First screen after choosing a theme: create an account, or log in to an existing one. */
export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useScheme();
  const palette = welcomePalette(scheme);
  const [legal, setLegal] = useState<LegalDocId | null>(null);

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <GridBackground color={palette.grid} />

      <View style={styles.middle}>
        <Animated.View entering={FadeInDown.delay(150).duration(500)} style={styles.center}>
          <View
            style={[
              styles.tile,
              { backgroundColor: palette.tileBg, borderColor: palette.tileBorder },
            ]}
          >
            <Image
              source={require('../../assets/images/logo-intro.png')}
              style={styles.logo}
              contentFit="contain"
            />
          </View>
          <Text style={[styles.title, { color: palette.text }]}>
            Welcome to Seznik Label Studio
          </Text>
          <Text style={[styles.subtitle, { color: palette.subtitle }]}>
            Design labels and print them from your phone: jewellery tags, shipping labels, barcodes
            and more.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(300).duration(500)} style={styles.actions}>
          <View style={styles.action}>
            <Text style={[styles.caption, { color: palette.subtitle }]}>
              New to Seznik Label Studio?
            </Text>
            <WelcomeButton
              label="Create account"
              palette={palette}
              onPress={() => router.push('/register')}
            />
          </View>
          <View style={styles.action}>
            <Text style={[styles.caption, { color: palette.subtitle }]}>
              Already have an account?
            </Text>
            <WelcomeButton
              label="Log in"
              variant="outline"
              palette={palette}
              onPress={() => router.push('/login')}
            />
          </View>
        </Animated.View>
      </View>

      <Text style={[styles.terms, { color: palette.muted, paddingBottom: insets.bottom + 18 }]}>
        By continuing, you agree to the{' '}
        <Text
          onPress={() => setLegal('terms')}
          accessibilityRole="link"
          style={[styles.termsLink, { color: palette.link }]}
        >
          Terms of Service
        </Text>{' '}
        and{' '}
        <Text
          onPress={() => setLegal('privacy')}
          accessibilityRole="link"
          style={[styles.termsLink, { color: palette.link }]}
        >
          Privacy Policy
        </Text>
        .
      </Text>

      <LegalModal doc={legal} palette={palette} onClose={() => setLegal(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  /** Content sits in the middle of the screen, a little below centre. */
  middle: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 32, paddingTop: 80 },
  center: { alignItems: 'center', gap: 12 },
  tile: {
    width: 76,
    height: 76,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  logo: { width: 72, height: 72, borderRadius: 20 },
  title: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5, textAlign: 'center' },
  subtitle: { fontSize: 16, lineHeight: 23, textAlign: 'center', maxWidth: 320 },
  actions: { gap: 20 },
  action: { gap: 10 },
  caption: { fontSize: 14.5, fontWeight: '600', textAlign: 'center' },
  termsLink: { fontWeight: '800' },
  terms: {
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: 'center',
    alignSelf: 'center',
    maxWidth: 300,
    paddingHorizontal: 24,
  },
});
