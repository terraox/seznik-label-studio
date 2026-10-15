export {
  buildClonedLabel,
  canBuildClonedLabel,
  detectionHasOutline,
  isCodePayloadText,
  resolveCloneStockSize,
  stripCodePayload,
} from './build-cloned-label';
export { cloneLabelFromImage } from './clone-from-image';
export { cloneSourceRect, mapPxBoxToMm, normalizeScannerBox } from './geometry';
export { scanCloneImage } from './scan-image';
export type { CloneCodeHit, CloneDetection, CloneOcrLine } from './types';
