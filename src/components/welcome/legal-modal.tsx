import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { WelcomePalette } from '@/components/welcome/welcome-palette';
import { ALL_ORIENTATIONS } from '@/lib/layout/screen-sizes';
import { LEGAL_DOCS, type LegalDocId } from '@/lib/legal-text';

/** Terms of Service / Privacy Policy in a card in the middle of the screen. */
export function LegalModal({
  doc,
  palette,
  onClose,
}: {
  doc: LegalDocId | null;
  palette: WelcomePalette;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const content = doc ? LEGAL_DOCS[doc] : null;

  return (
    <Modal
      visible={doc !== null}
      transparent
      animationType="none"
      statusBarTranslucent
      supportedOrientations={ALL_ORIENTATIONS}
      onRequestClose={onClose}
    >
      <Animated.View entering={FadeIn.duration(180)} style={styles.backdrop}>
        {/* Tapping outside the card closes it. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        {content ? (
          <Animated.View
            entering={ZoomIn.duration(200)}
            style={[
              styles.card,
              {
                backgroundColor: palette.tileBg,
                borderColor: palette.tileBorder,
                maxHeight: '78%',
                marginTop: insets.top,
                marginBottom: insets.bottom,
              },
            ]}
          >
            <Text style={[styles.title, { color: palette.text }]}>{content.title}</Text>
            <Text style={[styles.updated, { color: palette.muted }]}>
              Last updated {content.updated}
            </Text>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator
            >
              {content.sections.map((section) => (
                <View key={section.heading} style={styles.section}>
                  <Text style={[styles.heading, { color: palette.text }]}>{section.heading}</Text>
                  {section.body.map((paragraph) => (
                    <Text key={paragraph} style={[styles.body, { color: palette.subtitle }]}>
                      {paragraph}
                    </Text>
                  ))}
                </View>
              ))}
            </ScrollView>

            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={[styles.close, { backgroundColor: palette.buttonBg }]}
            >
              <Text style={[styles.closeText, { color: palette.buttonText }]}>Got it</Text>
            </Pressable>
          </Animated.View>
        ) : null}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    backgroundColor: 'rgba(0,0,0,0.62)', // theme-fixed: scrim behind the popup
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 18,
  },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  updated: { fontSize: 12.5, marginTop: 2, marginBottom: 12 },
  scroll: { flexShrink: 1 },
  scrollContent: { gap: 16, paddingBottom: 8 },
  section: { gap: 6 },
  heading: { fontSize: 15, fontWeight: '800' },
  body: { fontSize: 14, lineHeight: 21 },
  close: {
    height: 50,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  closeText: { fontSize: 16, fontWeight: '700' },
});
