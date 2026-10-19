import { usePathname } from 'expo-router';
import { useEffect, useState } from 'react';

import { FeedbackFormModal } from '@/components/feedback-form';
import { useFeedbackStore } from '@/stores/feedback-store';
import { usePrintStatsStore } from '@/stores/print-stats-store';

/** Screens where a popup would interrupt work in progress. */
const BUSY_PATHS = ['/print', '/print-photo', '/edit', '/excel-print', '/pdf-thermal', '/serial-label'];

/** Asks for a star rating and a short review once the user has printed 100 labels. */
export function FeedbackPrompt({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  const lifetime = usePrintStatsStore((s) => s.lifetime);
  const nextAt = useFeedbackStore((s) => s.nextAt);
  const [open, setOpen] = useState(false);

  const due = enabled && nextAt !== null && lifetime >= nextAt && !BUSY_PATHS.includes(pathname);

  useEffect(() => {
    if (!due) return;
    const t = setTimeout(() => setOpen(true), 1200);
    return () => clearTimeout(t);
  }, [due]);

  return (
    <FeedbackFormModal
      visible={open}
      title="Enjoying Sez Print?"
      message={`You have printed ${lifetime} labels. How would you rate the app?`}
      cancelLabel="Not now"
      onCancel={() => {
        setOpen(false);
        useFeedbackStore.getState().snooze(lifetime);
      }}
      onSubmit={(rating, text) => {
        setOpen(false);
        useFeedbackStore.getState().submit(rating, text, lifetime);
      }}
    />
  );
}
