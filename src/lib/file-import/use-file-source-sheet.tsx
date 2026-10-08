import { useCallback, useRef, useState, type ReactNode } from 'react';

import { ActionSheet } from '@/components/ui/action-sheet';

export type FileSourceChoice = 'local' | 'drive';

const PICKER_DELAY_MS = 280;

/**
 * Ask whether the user wants a local file or cloud drive before opening a picker.
 * Render `fileSourceSheet` on the same screen.
 */
export function useFileSourceSheet(): {
  requestFileSource: () => Promise<FileSourceChoice | null>;
  fileSourceSheet: ReactNode;
} {
  const [visible, setVisible] = useState(false);
  const resolveRef = useRef<((value: FileSourceChoice | null) => void) | null>(null);
  const choiceRef = useRef<FileSourceChoice | null>(null);

  const settle = useCallback((value: FileSourceChoice | null) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    resolve?.(value);
  }, []);

  const requestFileSource = useCallback(() => {
    return new Promise<FileSourceChoice | null>((resolve) => {
      if (resolveRef.current) resolveRef.current(null);
      resolveRef.current = resolve;
      choiceRef.current = null;
      setVisible(true);
    });
  }, []);

  const closeSheet = useCallback(() => {
    setVisible(false);
    const choice = choiceRef.current;
    choiceRef.current = null;
    if (!choice) {
      settle(null);
      return;
    }
    setTimeout(() => settle(choice), PICKER_DELAY_MS);
  }, [settle]);

  const choose = (source: FileSourceChoice) => {
    choiceRef.current = source;
  };

  const fileSourceSheet = (
    <ActionSheet
      visible={visible}
      onClose={closeSheet}
      items={[
        { label: 'Local File', onPress: () => choose('local') },
        { label: 'Drive', onPress: () => choose('drive') },
      ]}
    />
  );

  return { requestFileSource, fileSourceSheet };
}
