import { OcrError } from './errors';

export type ClipboardLike = {
  setStringAsync: (text: string) => Promise<boolean | void>;
};

export async function copyOcrText(text: string, clipboard?: ClipboardLike): Promise<void> {
  const value = text.trim();
  if (!value) {
    throw new OcrError('no_text', 'Nothing to copy yet. Identify text first, or type it below.');
  }

  const api = clipboard ?? (await import('expo-clipboard'));
  await api.setStringAsync(value);
}
