import { create } from 'zustand';

import {
  DEFAULT_OUTPUT_SIZE,
  defaultWatermark,
  clampCropNorm,
  normalizeRotation,
  resolveScopeIndices,
  type OutputSize,
  type PageScope,
  type PdfCrop,
  type PdfColorMode,
  type PdfEditSession,
  type PdfWatermark,
} from '@/lib/pdf-editor/session';

type PdfEditState = {
  session: PdfEditSession | null;
  startSession: (init: {
    sourceUri: string;
    sourceName: string;
    pageCount: number;
    pageSizesPt: { w: number; h: number }[];
  }) => void;
  resetSession: () => void;
  setCurrentPage: (index: number) => void;
  setOutputSize: (size: OutputSize) => void;
  /** Replace the page sizes once they have been read exactly (same page count only). */
  setPageSizes: (pageSizesPt: { w: number; h: number }[]) => void;
  setCrop: (crop: PdfCrop | null) => void;
  setCropScope: (scope: PageScope) => void;
  setCropOrigin: (originNorm: { x: number; y: number }) => void;
  setCropRect: (originNorm: { x: number; y: number }, sizeNorm?: { w: number; h: number }) => void;
  setRotationForCurrent: (deg: number) => void;
  setRotationForScope: (deg: number, scope: PageScope) => void;
  setSharpnessForCurrent: (value: number) => void;
  setSharpnessForScope: (value: number, scope: PageScope) => void;
  setWatermark: (watermark: PdfWatermark | null) => void;
  patchWatermark: (patch: Partial<PdfWatermark>) => void;
  setColorMode: (colorMode: PdfColorMode) => void;
  setColorModeForScope: (colorMode: PdfColorMode, scope: PageScope) => void;
};

function emptyArrays(pageCount: number) {
  return {
    rotationByPage: Array.from({ length: pageCount }, () => 0),
    sharpnessByPage: Array.from({ length: pageCount }, () => 0),
  };
}

export const usePdfEditStore = create<PdfEditState>((set) => ({
  session: null,

  startSession: ({ sourceUri, sourceName, pageCount, pageSizesPt }) =>
    set({
      session: {
        sourceUri,
        sourceName,
        pageCount,
        pageSizesPt,
        currentPageIndex: 0,
        outputSize: { ...DEFAULT_OUTPUT_SIZE },
        crop: null,
        watermark: null,
        colorMode: 'Original',
        ...emptyArrays(pageCount),
      },
    }),

  resetSession: () => set({ session: null }),

  setCurrentPage: (index) =>
    set((s) => {
      if (!s.session) return s;
      const i = Math.min(s.session.pageCount - 1, Math.max(0, index));
      return { session: { ...s.session, currentPageIndex: i } };
    }),

  setOutputSize: (size) =>
    set((s) => {
      if (!s.session) return s;
      return { session: { ...s.session, outputSize: size } };
    }),

  setPageSizes: (pageSizesPt) =>
    set((s) => (s.session && s.session.pageCount === pageSizesPt.length ? { session: { ...s.session, pageSizesPt } } : s)),

  setCrop: (crop) =>
    set((s) => (s.session ? { session: { ...s.session, crop } } : s)),

  setCropScope: (scope) =>
    set((s) => {
      if (!s.session) return s;
      const crop = s.session.crop ?? { scope, originNorm: { x: 0.5, y: 0.5 } };
      return { session: { ...s.session, crop: { ...crop, scope } } };
    }),

  setCropOrigin: (originNorm) =>
    set((s) => {
      if (!s.session) return s;
      const crop = s.session.crop ?? { scope: { mode: 'this' as const }, originNorm };
      return { session: { ...s.session, crop: { ...crop, originNorm } } };
    }),

  setCropRect: (originNorm, sizeNorm) =>
    set((s) => {
      if (!s.session) return s;
      const crop = s.session.crop ?? { scope: { mode: 'this' as const }, originNorm };
      const clamped = clampCropNorm(originNorm, sizeNorm);
      return { session: { ...s.session, crop: { ...crop, ...clamped } } };
    }),

  setRotationForCurrent: (deg) =>
    set((s) => {
      if (!s.session) return s;
      const rotationByPage = [...s.session.rotationByPage];
      rotationByPage[s.session.currentPageIndex] = normalizeRotation(deg);
      return { session: { ...s.session, rotationByPage } };
    }),

  setRotationForScope: (deg, scope) =>
    set((s) => {
      if (!s.session) return s;
      const rotationByPage = [...s.session.rotationByPage];
      const next = normalizeRotation(deg);
      for (const i of resolveScopeIndices(scope, s.session.pageCount, s.session.currentPageIndex)) {
        rotationByPage[i] = next;
      }
      return { session: { ...s.session, rotationByPage } };
    }),

  setSharpnessForCurrent: (value) =>
    set((s) => {
      if (!s.session) return s;
      const sharpnessByPage = [...s.session.sharpnessByPage];
      sharpnessByPage[s.session.currentPageIndex] = Math.min(100, Math.max(0, value));
      return { session: { ...s.session, sharpnessByPage } };
    }),

  setSharpnessForScope: (value, scope) =>
    set((s) => {
      if (!s.session) return s;
      const sharpnessByPage = [...s.session.sharpnessByPage];
      const next = Math.min(100, Math.max(0, value));
      for (const i of resolveScopeIndices(scope, s.session.pageCount, s.session.currentPageIndex)) {
        sharpnessByPage[i] = next;
      }
      return { session: { ...s.session, sharpnessByPage } };
    }),

  setWatermark: (watermark) =>
    set((s) => (s.session ? { session: { ...s.session, watermark } } : s)),

  patchWatermark: (patch) =>
    set((s) => {
      if (!s.session) return s;
      const base = s.session.watermark ?? defaultWatermark();
      return { session: { ...s.session, watermark: { ...base, ...patch } } };
    }),

  setColorMode: (colorMode) =>
    set((s) => (s.session ? { session: { ...s.session, colorMode, colorModeByPage: undefined } } : s)),

  setColorModeForScope: (colorMode, scope) =>
    set((s) => {
      if (!s.session) return s;
      const current = s.session.colorMode;
      const colorModeByPage = [
        ...(s.session.colorModeByPage ?? Array.from({ length: s.session.pageCount }, () => current)),
      ];
      for (const i of resolveScopeIndices(scope, s.session.pageCount, s.session.currentPageIndex)) {
        colorModeByPage[i] = colorMode;
      }
      return {
        session: {
          ...s.session,
          colorMode: colorModeByPage[s.session.currentPageIndex] ?? colorMode,
          colorModeByPage,
        },
      };
    }),
}));

export { defaultWatermark };
