import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { IosAlertInput, IosAlertModal } from '@/components/ui/ios-alert-modal';
import { CONSUMER_PRINTER_LIST } from '@/constants/printer-models';
import type { FeedbackKind, FeedbackPayload } from '@/lib/telemetry/events';
import { makeStyles } from '@/theme';

const KINDS: { id: FeedbackKind; label: string }[] = [
  { id: 'suggestion', label: 'Suggestion' },
  { id: 'feedback', label: 'Feedback' },
];

/**
 * Evaluation & Feedback form: suggestion or feedback, optional printer, title and details.
 * Shared by Settings and the post-print prompt.
 */
export function FeedbackFormModal({
  visible,
  title = 'Evaluation & Feedback',
  message = 'Send a suggestion or feedback. Pick a printer only if it is about one.',
  cancelLabel = 'Cancel',
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  title?: string;
  message?: string;
  cancelLabel?: string;
  onCancel: () => void;
  onSubmit: (payload: FeedbackPayload) => void;
}) {
  const styles = useStyles();
  const [kind, setKind] = useState<FeedbackKind | null>(null);
  const [printerName, setPrinterName] = useState<string | null>(null);
  const [headline, setHeadline] = useState('');
  const [body, setBody] = useState('');

  useEffect(() => {
    if (visible) {
      setKind(null);
      setPrinterName(null);
      setHeadline('');
      setBody('');
    }
  }, [visible]);

  const ready = kind != null && headline.trim().length >= 1 && body.trim().length >= 3;

  return (
    <IosAlertModal
      visible={visible}
      onClose={onCancel}
      plainScroll
      cardAlign="center"
      cardMaxWidth={340}
      title={title}
      message={message}
      buttons={[
        { text: cancelLabel, style: 'cancel', onPress: onCancel },
        {
          text: 'Submit',
          bold: true,
          disabled: !ready,
          onPress: () => {
            if (!kind) return;
            onSubmit({
              kind,
              title: headline.trim(),
              message: body.trim(),
              printerName,
            });
          },
        },
      ]}>
      <Text style={styles.groupLabel}>What are you sending?</Text>
      <View style={styles.chipRow}>
        {KINDS.map((item) => {
          const on = kind === item.id;
          return (
            <Pressable
              key={item.id}
              onPress={() => setKind(item.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[styles.chip, on && styles.chipOn]}>
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.groupLabel}>Printer (optional)</Text>
      <View style={styles.chipRow}>
        {CONSUMER_PRINTER_LIST.map((p) => {
          const on = printerName === p.shortName;
          return (
            <Pressable
              key={p.id}
              onPress={() => setPrinterName(on ? null : p.shortName)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[styles.chip, on && styles.chipOn]}>
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{p.shortName}</Text>
            </Pressable>
          );
        })}
      </View>

      <IosAlertInput
        value={headline}
        onChangeText={setHeadline}
        placeholder="Title"
        maxLength={120}
        style={styles.titleInput}
      />
      <IosAlertInput
        value={body}
        onChangeText={setBody}
        placeholder="Tell us more…"
        multiline
        scrollEnabled
        numberOfLines={4}
        maxLength={500}
        style={styles.review}
      />
    </IosAlertModal>
  );
}

const useStyles = makeStyles((c) => ({
  groupLabel: {
    alignSelf: 'stretch',
    marginTop: 12,
    marginBottom: 6,
    fontSize: 12,
    fontWeight: '600',
    color: c.textSecondary,
  },
  chipRow: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  chipOn: {
    backgroundColor: c.accentSoft,
    borderColor: c.accent,
  },
  chipText: { fontSize: 14, color: c.text, fontWeight: '500' },
  chipTextOn: { color: c.accentStrong, fontWeight: '600' },
  titleInput: { marginTop: 12 },
  review: { height: 96, maxHeight: 96, paddingVertical: 8, textAlignVertical: 'top' },
}));
