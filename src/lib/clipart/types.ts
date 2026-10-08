import type { ClipartCategoryId } from '@/constants/clipart-catalog';

export type UserClipartKind = 'svg' | 'image';

export type BuiltinClipartItem = {
  id: string;
  label: string;
  category: ClipartCategoryId;
  source: 'builtin';
  svg: string;
};

export type UserSvgClipartItem = {
  id: string;
  label: string;
  category: 'local';
  source: 'user';
  kind: 'svg';
  fileUri: string;
  /** Filled after the file is read. Not persisted. */
  svg?: string;
};

export type UserImageClipartItem = {
  id: string;
  label: string;
  category: 'local';
  source: 'user';
  kind: 'image';
  fileUri: string;
  widthPx?: number;
  heightPx?: number;
};

export type ClipartItem = BuiltinClipartItem | UserSvgClipartItem | UserImageClipartItem;

export function clipartSvgSource(item: ClipartItem | undefined): string | undefined {
  if (!item) return undefined;
  if (item.source === 'builtin') return item.svg;
  if (item.kind === 'svg') return item.svg;
  return undefined;
}

export function clipartImageUri(item: ClipartItem | undefined): string | undefined {
  if (!item || item.source !== 'user' || item.kind !== 'image') return undefined;
  return item.fileUri;
}
