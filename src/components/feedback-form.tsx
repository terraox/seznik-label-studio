import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { IosAlertInput, IosAlertModal } from '@/components/ui/ios-alert-modal';
import { makeStyles } from '@/theme';

/**
 * Small popup that asks for 1-5 stars and an optional review. Shared by the "Evaluation & Feedback"
 * setting and the prompt that appears after 100 labels; `onSubmit` receives what the user entered.
 */
export function FeedbackFormModal({
  visible,
  title,
  message,
  cancelLabel = 'Cancel',
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  title: string;
  message: string;
  cancelLabel?: string;
  onCancel: () => void;
  onSubmit: (rating: number, text: string) => void;
}) {
  const styles = useStyles();
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');

  // A fresh form every time it opens.
  useEffect(() => {
    if (visible) {
      setRating(0);
      setText('');
    }
  }, [visible]);

  return (
    <IosAlertModal
      visible={visible}
      onClose={onCancel}
      plainScroll
      cardMaxWidth={320}
      title={title}
      message={message}
      buttons={[
        { text: cancelLabel, style: 'cancel', onPress: onCancel },
        { text: 'Submit', bold: true, disabled: rating === 0, onPress: () => onSubmit(rating, text) },
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
        placeholder="Write a review (optional)"
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
  stars: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 10 },
  star: { fontSize: 34, color: c.textMuted },
  starOn: { color: c.accent },
  // Fixed height: the box scrolls inside instead of growing as the review gets longer.
  review: { height: 96, maxHeight: 96, paddingVertical: 8, textAlignVertical: 'top' },
}));
