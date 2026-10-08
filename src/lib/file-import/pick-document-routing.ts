import type { FileSourceChoice } from '@/lib/file-import/use-file-source-sheet';

export function shouldUseLocalFilePicker(source: FileSourceChoice, platform: string): boolean {
  return platform === 'android' && source === 'local';
}
