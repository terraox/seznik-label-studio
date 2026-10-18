import { usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { IosAlertInput, IosAlertModal } from '@/components/ui/ios-alert-modal';
import { useFeedbackStore } from '@/stores/feedback-store';
import { usePrintStatsStore } from '@/stores/print-stats-store';
import { makeStyles } from '@/theme';

/** Screens where a popup would interrupt work in progress. */
const BUSY_PATHS = ['/print', '/print-photo', '/edit', '/excel-print', '/pdf-thermal', '/serial-label'];

/** Asks for a star rating and a short review once the user has printed 100 labels. */
export function FeedbackPrompt({ enabled }: { enabled: boolean }) {
  const styles = useStyles();
  const pathname = usePathname();
  const lifetime = usePrintStatsStore((s) => s.lifetime);
  const nextAt = useFeedbackStore((s) => s.nextAt);
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');

  const due = enabled && nextAt !== null && lifetime >= nextAt && !BUSY_PATHS.includes(pathname);

  useEffect(() => {
    if (!due) return;
    const t = setTimeout(() => setOpen(true), 1200);
    return () => clearTimeout(t);
  }, [due]);

  const notNow = () => {
    setOpen(false);
    useFeedbackStore.getState().snooze(lifetime);
  };

  const send = () => {
    setOpen(false);
    useFeedbackStore.getState().submit(rating, text, lifetime);
  };

  return (
    <IosAlertModal
      visible={open}
      onClose={notNow}
      title="Enjoying Sez Print?"
      message={`You have printed ${lifetime} labels. How would you rate the app?`}
      buttons={[
        { text: 'Not now', style: 'cancel', onPress: notNow },
        { text: 'Send', bold: true, disabled: rating === 0, onPress: send },
      ]}>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} hitSlop={6} onPress={() => setRating(n)} accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`}>
            <Text style={[styles.star, n <= rating && styles.starOn]}>{n <= rating ? '★' : '☆'}</Text>
          </Pressable>
        ))}
      </View>
      <IosAlertInput
        value={text}
        onChangeText={setText}
        placeholder="Tell us what you think (optional)"
        multiline
        maxLength={500}
        style={styles.review}
      />
    </IosAlertModal>
  );
}

const useStyles = makeStyles((c) => ({
  stars: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 10 },
  star: { fontSize: 34, color: c.textMuted },
  starOn: { color: c.accent },
  review: { minHeight: 70, textAlignVertical: 'top' },
}));
