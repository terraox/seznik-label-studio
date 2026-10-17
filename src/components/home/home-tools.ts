import type Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

export type ToolGlyph = ComponentProps<typeof Ionicons>['name'];

export type HomeToolGroup = 'create' | 'file' | 'labelType';

export type HomeTool = {
  label: string;
  href: string;
  icon: ToolGlyph;
  group: HomeToolGroup;
};

export const HOME_TOOLS = {
  newLabel: { label: 'New Label', href: '/new-label', icon: 'add-circle-outline', group: 'create' },
  imageToLabel: { label: 'Upload label', href: '/image-to-label', icon: 'image-outline', group: 'create' },
  serialLabels: { label: 'Serial Labels', href: '/new-label-setup?serialEditor=1', icon: 'list-outline', group: 'create' },
  customSize: {
    label: 'Custom Size',
    href: '/customize-template',
    icon: 'resize-outline',
    group: 'create',
  },
  excel: { label: 'Excel', href: '/excel-print', icon: 'grid-outline', group: 'file' },
  pdf: { label: 'PDF', href: '/pdf', icon: 'document-text-outline', group: 'file' },
  photo: { label: 'Photo', href: '/print-photo-modal', icon: 'images-outline', group: 'file' },
  twoUps: {
    label: '2-Up Label',
    href: '/new-label-setup?isTwoUps=true',
    icon: 'copy-outline',
    group: 'labelType',
  },
  shipping: { label: 'Shipping', href: '/shipping-label', icon: 'cube-outline', group: 'labelType' },
  jewellery: { label: 'Jewellery', href: '/jewellery-label', icon: 'diamond-outline', group: 'labelType' },
  fitImage: { label: 'Fit Image', href: '/img-to-label', icon: 'expand-outline', group: 'labelType' },
} as const satisfies Record<string, HomeTool>;

export type HomeToolId = keyof typeof HOME_TOOLS;

export const CREATE_HERO_TOOL: HomeToolId = 'newLabel';

/** "More ways to create" — 3-column ToolGrid. */
export const CREATE_GRID_TOOLS: readonly HomeToolId[] = ['imageToLabel', 'serialLabels', 'customSize'];

/** "Print from file" — 3-column ToolGrid. */
export const FILE_TOOLS: readonly HomeToolId[] = ['excel', 'pdf', 'photo'];

/** "Label types" — 4-column ToolGrid. */
export const LABEL_TYPE_TOOLS: readonly HomeToolId[] = ['twoUps', 'shipping', 'jewellery', 'fitImage'];

/** Groups that must fill whole 3-column rows. */
export const TOOL_GRID_GROUPS = { create: CREATE_GRID_TOOLS, file: FILE_TOOLS } as const;
