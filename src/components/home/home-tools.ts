import type Ionicons from '@expo/vector-icons/Ionicons';
import type MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';

export type ToolGlyph = ComponentProps<typeof Ionicons>['name'];

export type MaterialGlyph = ComponentProps<typeof MaterialCommunityIcons>['name'];

export type HomeToolGroup = 'create' | 'file';

export type HomeTool = {
  label: string;
  /** Where the tile goes. Tools with `action` run that instead. */
  href?: string;
  /** Runs in place instead of navigating: 'openLabelFile' opens the .seznik file picker. */
  action?: 'openLabelFile';
  icon: ToolGlyph;
  /** One short line under the title on the home tile. */
  hint?: string;
  /** Glyph from MaterialCommunityIcons, for marks Ionicons does not have (Excel). Overrides `icon`. */
  materialIcon?: MaterialGlyph;
  group: HomeToolGroup;
};

export const HOME_TOOLS = {
  newLabel: { label: 'New Label', href: '/new-label', icon: 'add-circle-outline', group: 'create' },
  imageToLabel: { label: 'Upload label', href: '/image-to-label', icon: 'image-outline', hint: 'From a soft copy', group: 'create' },
  serialLabels: { label: 'Serial Labels', href: '/new-label-setup?serialEditor=1', icon: 'list-outline', hint: '001, 002, 003…', group: 'create' },
  shippingLabels: {
    label: 'Shipping Labels',
    href: '/ecommerce-label',
    icon: 'cube-outline',
    hint: 'Marketplace PDFs',
    group: 'create',
  },
  excel: {
    label: 'Excel',
    href: '/excel-print',
    icon: 'grid-outline',
    materialIcon: 'file-excel-outline',
    hint: 'Bulk from a sheet',
    group: 'file',
  },
  printImage: { label: 'Image', href: '/new-label-setup?printImage=1', icon: 'image-outline', hint: 'Print a photo', group: 'file' },
  pdf: { label: 'PDF', href: '/pdf', icon: 'document-text-outline', hint: 'Print any page', group: 'file' },
  importLabel: { label: 'Import', action: 'openLabelFile', icon: 'download-outline', hint: '.seznik label file', group: 'file' },
} as const satisfies Record<string, HomeTool>;

export type HomeToolId = keyof typeof HOME_TOOLS;

export const CREATE_HERO_TOOL: HomeToolId = 'newLabel';

/** "More ways to create" — 3-column ToolGrid. */
export const CREATE_GRID_TOOLS: readonly HomeToolId[] = ['imageToLabel', 'serialLabels', 'shippingLabels'];

/** "Print from file" — 3-column ToolGrid. The Image tile (printImage) is defined above but not shown on Home. */
export const FILE_TOOLS: readonly HomeToolId[] = ['excel', 'pdf', 'importLabel'];

/** Tools that exist but are not placed on the Home screen. */
export const UNPLACED_HOME_TOOLS: readonly HomeToolId[] = ['printImage'];

/** Groups that must fill whole 3-column rows. */
export const TOOL_GRID_GROUPS = { create: CREATE_GRID_TOOLS, file: FILE_TOOLS } as const;

/** Columns each group renders with. */
export const TOOL_GRID_COLUMNS = { create: 3, file: 3 } as const;
