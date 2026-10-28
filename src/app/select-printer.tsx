import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { authPalette, AuthScreen, LinkText, PrimaryButton } from '@/components/auth/auth-ui';
import {
  CONSUMER_PRINTER_LIST,
  type ConsumerPrinter,
  type ConsumerPrinterId,
} from '@/constants/printer-models';
import { useAuthStore } from '@/stores/auth-store';
import { makeStyles } from '@/theme';

// Small copies of the printer photos: the full 1024px PNGs decode slowly for a card.
const PHOTOS: Record<ConsumerPrinterId, number> = {
  tejas: require('../../assets/images/notice/printer_tejas.png'),
  rudra: require('../../assets/images/notice/printer_rudra.png'),
  josh: require('../../assets/images/notice/printer_josh.png'),
};

function PrinterPhoto({ printer, size }: { printer: ConsumerPrinter; size: number }) {
  const styles = useStyles();
  return (
    <View
      style={[styles.stage, { width: size, height: size, backgroundColor: printer.accentSoft }]}
    >
      <Image
        source={PHOTOS[printer.id]}
        style={{ width: size - 12, height: size - 12 }}
        contentFit="contain"
        cachePolicy="memory"
      />
    </View>
  );
}

export default function SelectPrinterScreen() {
  const styles = useStyles();
  const router = useRouter();
  const setPrinter = useAuthStore((s) => s.setPrinter);
  const [step, setStep] = useState<'supported' | 'choose'>('supported');
  const [selected, setSelected] = useState<ConsumerPrinterId | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    const result = await setPrinter(selected);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.replace('/');
  };

  if (step === 'supported') {
    return (
      <AuthScreen title="Printers we support" subtitle="Seznik works with these printers right now">
        <View style={styles.list}>
          {CONSUMER_PRINTER_LIST.map((printer) => (
            <View key={printer.id} style={[styles.card, { borderColor: printer.accentBorder }]}>
              <PrinterPhoto printer={printer} size={92} />
              <View style={styles.cardText}>
                <Text style={[styles.name, { color: printer.accent }]}>{printer.name}</Text>
                <Text style={styles.tagline}>{printer.tagline}</Text>
              </View>
            </View>
          ))}
        </View>
        <Text style={styles.note}>More printers are on the way.</Text>
        <PrimaryButton label="Continue" onPress={() => setStep('choose')} />
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      title="Which printer did you buy?"
      subtitle="Choose the printer you bought so Seznik is set up for it and prints at its best. We'll select it automatically when you connect over Bluetooth."
    >
      <View style={styles.list}>
        {CONSUMER_PRINTER_LIST.map((printer) => {
          const active = selected === printer.id;
          return (
            <Pressable
              key={printer.id}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => {
                setSelected(printer.id);
                setError(null);
              }}
              style={[
                styles.card,
                active && { borderColor: printer.accent, backgroundColor: printer.accentSoft },
              ]}
            >
              <PrinterPhoto printer={printer} size={72} />
              <View style={styles.cardText}>
                <Text style={[styles.name, active && { color: printer.accent }]}>
                  {printer.name}
                </Text>
                <Text style={styles.tagline}>{printer.tagline}</Text>
              </View>
              {active ? (
                <View style={[styles.check, { backgroundColor: printer.accent }]}>
                  <AppIcon name="checkmark" tintColor="#FFFFFF" size={12} />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton
        label={saving ? 'Saving…' : 'Continue'}
        onPress={submit}
        disabled={!selected || saving}
      />
      <View style={styles.back}>
        <LinkText label="Back to supported printers" onPress={() => setStep('supported')} />
      </View>
    </AuthScreen>
  );
}

const useStyles = makeStyles((_c, scheme) => {
  const A = authPalette(scheme);
  return {
    list: { gap: 12 },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      borderWidth: 1.5,
      borderColor: A.border,
      borderRadius: 18,
      padding: 12,
      backgroundColor: A.field,
    },
    stage: { borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    cardText: { flex: 1 },
    name: { fontSize: 16, fontWeight: '800', color: A.text },
    tagline: { marginTop: 4, fontSize: 13, color: A.muted, lineHeight: 18 },
    check: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
    note: { fontSize: 13, color: A.muted, textAlign: 'center' },
    back: { alignItems: 'center', marginTop: 4 },
    error: { color: A.error, fontSize: 13, textAlign: 'center' },
  } as const;
});
