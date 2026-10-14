import { useCallback, useRef, useState, type ReactNode } from 'react';

import { ActionSheet } from '@/components/ui/action-sheet';

export type FileSourceChoice = 'local' | 'drive';

export type FileSourceRequest = {
  /** Replaces the "Google Drive" label, e.g. to mention Google Sheets. */
  driveLabel?: string;
};

const PICKER_DELAY_MS = 280;

/**
 * Ask whether the user wants This Device or Google Drive before opening a picker.
 * Render `fileSourceSheet` on the same screen.
 */
export function useFileSourceSheet(): {
  requestFileSource: (request?: FileSourceRequest) => Promise<FileSourceChoice | null>;
  fileSourceSheet: ReactNode;
} {
  const [visible, setVisible] = useState(false);
  const [driveLabel, setDriveLabel] = useState('Google Drive');
  const resolveRef = useRef<((value: FileSourceChoice | null) => void) | null>(null);
  const choiceRef = useRef<FileSourceChoice | null>(null);

  const settle = useCallback((value: FileSourceChoice | null) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    resolve?.(value);
  }, []);

  const requestFileSource = useCallback((request?: FileSourceRequest) => {
    return new Promise<FileSourceChoice | null>((resolve) => {
      setDriveLabel(request?.driveLabel ?? 'Google Drive');
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
        { label: 'This Device', onPress: () => choose('local') },
        { label: driveLabel, onPress: () => choose('drive') },
      ]}
    />
  );

  return { requestFileSource, fileSourceSheet };
}
