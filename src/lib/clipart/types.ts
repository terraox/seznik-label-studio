import type { ClipartCategoryId } from '@/constants/clipart-catalog';

export type ClipartItem = {
  id: string;
  label: string;
  category: ClipartCategoryId | 'mine';
  svg: string;
  source: 'builtin' | 'user';
};
