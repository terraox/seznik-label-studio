/**
 * Smart Crop — public surface.
 *
 * Phase 1: the detector only. Tap-to-select, region grow and the per-page
 * matcher land in Phase 2 and Phase 3 (SMART_CROP_PLAN.md §7).
 */

export { detectSections } from './detector';
export { DEFAULT_DETECT_OPTIONS, resolveOptions, type DetectOptions } from './params';
export { toAnalysisGray, measureTone, binarize, Integral, inkBounds } from './gray';
export { leaves, sectionById, unionRects } from './types';
export type {
  Axis,
  DetectResult,
  DetectTiming,
  DroppedSection,
  DropReason,
  EdgeKind,
  GrayPage,
  NormRect,
  PxRect,
  Section,
  SectionKind,
  SeparatorKind,
} from './types';
