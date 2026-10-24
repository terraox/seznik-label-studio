import { usePathname } from 'expo-router';
import { useEffect, useState } from 'react';

import { FeedbackFormModal } from '@/components/feedback-form';
import type { FeedbackPayload } from '@/lib/telemetry/events';
import { useFeedbackStore } from '@/stores/feedback-store';
import { selectLifetime, usePrintStatsStore } from '@/stores/print-stats-store';

/** Screens where a popup would interrupt work in progress. */
const BUSY_PATHS = ['/print', '/print-photo', '/edit', '/excel-print', '/pdf-thermal', '/serial-label'];

/** Asks for a suggestion or feedback once the user has printed 100 labels. */
export function FeedbackPrompt({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  const lifetime = usePrintStatsStore(selectLifetime);
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
      title="How are we doing?"
      message={`You have printed ${lifetime} labels. Send a suggestion or feedback — we read every one.`}
      cancelLabel="Not now"
      onCancel={() => {
        setOpen(false);
        useFeedbackStore.getState().snooze(lifetime);
      }}
      onSubmit={(payload: FeedbackPayload) => {
        setOpen(false);
        useFeedbackStore.getState().submit(payload, lifetime);
      }}
    />
  );
}
