import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { AutoWrapping, QrErrorLevel, QrZoneSize } from '@/components/editor/types';
import { DEFAULT_CANVAS_SPLIT_RATIO } from '@/lib/editor/canvas-split';
import { readPaperType, type LabelOrientation, type PaperType } from '@/lib/label-document';
import type { AppearancePreference } from '@/theme/tokens';

export type ColorMode = 'Original' | 'B & W' | 'Halftone';

/** Selection outline swatches — Editor Settings → Color of The Selected Border. */
export const EDITOR_BORDER_SELECTION_COLORS = ['#111111', '#9CA3AF'] as const;

/** Selection outline swatches — Editor Settings → Color of The Selected Table Cell. */
export const EDITOR_TABLE_SELECTION_COLORS = ['#111111', '#D1D5DB'] as const;

/** Editor design grid line colors (Editor Settings → Color of Grid). */
export const EDITOR_GRID_COLORS = ['#000000', '#6B7280', '#D1D5DB', '#FFFFFF', '#FCE7F3'] as const;

export type EditorSettings = {
  showColumnName: boolean;
  highlightColumnName: boolean;
  pictureAdsorption: boolean;
  /** When true, elements released outside the label spring back in and overlaps warn. */
  safeMode: boolean;
  editorGrid: boolean;
  /** Design grid cell size in mm (editor-only overlay). */
  editorGridSpacingMm: number;
  /** Design grid line color (hex). */
  editorGridColor: string;
  /**
   * When true, grid lines draw above elements (visible across the label).
   * When false, elements cover the grid (knockouts under each element).
   */
  editorGridOverlay: boolean;
  /** One-time alert shown when the user first enables the design grid. */
  editorGridDisclaimerSeen: boolean;
  /** Extra D-pad under the canvas. Off by default — use Editor Settings to show it. */
  showNudgePad: boolean;
  /** mm rulers (the scale) along the top and left of the canvas. On unless set to false. */
  showRulers?: boolean;
  /** Canvas share of the editor split column (0.35–0.89). */
  canvasSplitRatio: number;
  /** When true, the tools sheet is collapsed and the canvas uses the full column. */
  canvasSplitFullscreen: boolean;
  borderColorIndex: number;
  tableColorIndex: number;
};

export type DefaultPropertySettings = {
  labelWidth: number;
  labelHeight: number;
  orientation: LabelOrientation;
  paperType: PaperType;
  autoFitFont: boolean;
  autoFitSize: boolean;
  autoWrap: AutoWrapping;
  autoTextHeight: boolean;
  qrErrorLevel: QrErrorLevel;
  qrZoneSize: QrZoneSize;
  tileImage: boolean;
  colorMode: ColorMode;
  grayThreshold: number;
  barcodeEncodeMode: string;
};

export type PrintingSettings = {
  recordHistory: boolean;
  autoPages: boolean;
  returnPrevious: boolean;
  /**
   * Printer resolution override: 304 (12 dots/mm), 300, or 203 (8 dots/mm).
   * `null` means auto — resolve from the selected printer model's declared DPI,
   * which is the correct value for every supported model. Only set this for a
   * generic printer whose head differs from its model's default; a wrong value
   * scales every print (TSPL puts one bitmap dot on one head dot).
   */
  printerDpi: number | null;
  /** Printhead alignment: 'center' (standard thermal desktop) or 'left'. */
  printerAlignment: 'center' | 'left';
  /** Printhead physical width in mm (108mm for 4-inch printers). */
  printheadWidthMm: number;
  /** Last custom paper/page size entered in the print size selector (mm). */
  customPaperWidthMm: number;
  customPaperHeightMm: number;
};

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  showColumnName: false,
  highlightColumnName: false,
  pictureAdsorption: true,
  safeMode: false,
  editorGrid: false,
  editorGridSpacingMm: 5,
  editorGridColor: '#000000',
  editorGridOverlay: true,
  editorGridDisclaimerSeen: false,
  showNudgePad: false,
  canvasSplitRatio: DEFAULT_CANVAS_SPLIT_RATIO,
  canvasSplitFullscreen: false,
  borderColorIndex: 0,
  tableColorIndex: 0,
};

export const DEFAULT_PROPERTY_SETTINGS: DefaultPropertySettings = {
  labelWidth: 40,
  labelHeight: 30,
  orientation: 0,
  paperType: 'Label',
  autoFitFont: true,
  autoFitSize: true,
  autoWrap: 'Word',
  autoTextHeight: true,
  qrErrorLevel: 'L',
  qrZoneSize: '0',
  tileImage: false,
  colorMode: 'B & W',
  grayThreshold: 160,
  barcodeEncodeMode: 'CODE-128',
};

export const DEFAULT_PRINTING_SETTINGS: PrintingSettings = {
  recordHistory: true,
  autoPages: true,
  returnPrevious: false,
  printerDpi: null,
  printerAlignment: 'left',
  printheadWidthMm: 108,
  customPaperWidthMm: 210,
  customPaperHeightMm: 297,
};

type SettingsStoreState = {
  editor: EditorSettings;
  defaults: DefaultPropertySettings;
  printing: PrintingSettings;
  language: string;
  tutorialSeen: boolean;
  /** First-launch "supported printers" welcome card has been dismissed. */
  printerNoticeSeen: boolean;
  /** The label-canvas tour has been seen (or skipped) at least once. */
  canvasTutorialSeen: boolean;
  /** The Print Excel tour has been seen (or skipped) at least once. */
  excelTutorialSeen: boolean;
  /** The Data Column copies tour has been seen (or skipped) at least once. */
  excelColumnsTutorialSeen: boolean;
  /** The blank-label size page tour has been seen (or skipped) at least once. */
  newLabelTutorialSeen: boolean;
  /** The Collated / Uncollated explainer (shown when Multiply all counts first goes above 1) has been seen. */
  printOrderTourSeen: boolean;
  /** Print PDF screens whose tour was seen (or skipped): 'pick' | 'size' | 'edit' | 'print'. */
  pdfTourSeen: string[];
  /** PDF crop: the one-time "tap again for the bigger block" hint has been shown. */
  smartCropHintSeen: boolean;
  /** Settings → Appearance. Follow system by default. */
  appearance: AppearancePreference;
  /** The first-launch "choose your look" screen has been answered. */
  themeChosen: boolean;
  /** Settings profile card photo (file uri inside sezprint/images), or null. */
  profilePhotoUri: string | null;
  patchEditor: (updates: Partial<EditorSettings>) => void;
  restoreEditorDefaults: () => void;
  patchDefaults: (updates: Partial<DefaultPropertySettings>) => void;
  restoreDefaultPropertyDefaults: () => void;
  patchPrinting: (updates: Partial<PrintingSettings>) => void;
  setLanguage: (language: string) => void;
  setTutorialSeen: (seen: boolean) => void;
  setPrinterNoticeSeen: (seen: boolean) => void;
  setCanvasTutorialSeen: (seen: boolean) => void;
  setExcelTutorialSeen: (seen: boolean) => void;
  setExcelColumnsTutorialSeen: (seen: boolean) => void;
  setNewLabelTutorialSeen: (seen: boolean) => void;
  setPrintOrderTourSeen: (seen: boolean) => void;
  markPdfTourSeen: (screen: string) => void;
  setSmartCropHintSeen: (seen: boolean) => void;
  setAppearance: (appearance: AppearancePreference) => void;
  setThemeChosen: (chosen: boolean) => void;
  setProfilePhotoUri: (uri: string | null) => void;
};

export const useSettingsStore = create<SettingsStoreState>()(
  persist(
    (set) => ({
      editor: DEFAULT_EDITOR_SETTINGS,
      defaults: DEFAULT_PROPERTY_SETTINGS,
      printing: DEFAULT_PRINTING_SETTINGS,
      language: 'en',
      tutorialSeen: false,
      printerNoticeSeen: false,
      canvasTutorialSeen: false,
      excelTutorialSeen: false,
      excelColumnsTutorialSeen: false,
      newLabelTutorialSeen: false,
      printOrderTourSeen: false,
      pdfTourSeen: [],
      smartCropHintSeen: false,
      appearance: 'light',
      themeChosen: false,
      profilePhotoUri: null,

      patchEditor: (updates) => set((state) => ({ editor: { ...state.editor, ...updates } })),
      restoreEditorDefaults: () => set({ editor: DEFAULT_EDITOR_SETTINGS }),
      patchDefaults: (updates) =>
        set((state) => ({ defaults: { ...state.defaults, ...updates } })),
      restoreDefaultPropertyDefaults: () => set({ defaults: DEFAULT_PROPERTY_SETTINGS }),
      patchPrinting: (updates) =>
        set((state) => ({ printing: { ...state.printing, ...updates } })),
      setLanguage: (language) => set({ language }),
      setTutorialSeen: (seen) => set({ tutorialSeen: seen }),
      setPrinterNoticeSeen: (seen) => set({ printerNoticeSeen: seen }),
      setCanvasTutorialSeen: (seen) => set({ canvasTutorialSeen: seen }),
      setExcelTutorialSeen: (seen) => set({ excelTutorialSeen: seen }),
      setExcelColumnsTutorialSeen: (seen) => set({ excelColumnsTutorialSeen: seen }),
      setNewLabelTutorialSeen: (seen) => set({ newLabelTutorialSeen: seen }),
      setPrintOrderTourSeen: (seen) => set({ printOrderTourSeen: seen }),
      markPdfTourSeen: (screen) =>
        set((s) => (s.pdfTourSeen.includes(screen) ? s : { pdfTourSeen: [...s.pdfTourSeen, screen] })),
      setSmartCropHintSeen: (seen) => set({ smartCropHintSeen: seen }),
      setAppearance: (appearance) => set({ appearance }),
      setThemeChosen: (themeChosen) => set({ themeChosen }),
      setProfilePhotoUri: (profilePhotoUri) => set({ profilePhotoUri }),
    }),
    {
      name: 'sez-print/settings',
      storage: createJSONStorage(() => AsyncStorage),
      // Same shallow merge as the default. A saved Black mark (or unknown) default opens as Label.
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<SettingsStoreState>;
        const merged = { ...current, ...saved };
        if (saved.editor) {
          merged.editor = { ...DEFAULT_EDITOR_SETTINGS, ...saved.editor };
        }
        if (saved.defaults) {
          merged.defaults = { ...DEFAULT_PROPERTY_SETTINGS, ...saved.defaults, paperType: readPaperType(saved.defaults.paperType) };
        }
        return merged;
      },
    },
  ),
);
