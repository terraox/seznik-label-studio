import type { LookupFont, LookupInstalled } from '@/lib/fonts/lookup';
import { lookupFontFamily } from '@/lib/fonts/lookup';

/**
 * Bundled Noto faces for the eight Indian scripts already in the app.
 * Keys match `APP_FONT_MAP` / `FONT_LIBRARY`.
 */
export const INDIC_SCRIPT_FAMILIES = {
  devanagari: 'NotoSansDevanagari_400Regular',
  bengali: 'NotoSansBengali_400Regular',
  gurmukhi: 'NotoSansGurmukhi_400Regular',
  gujarati: 'NotoSansGujarati_400Regular',
  tamil: 'NotoSansTamil_400Regular',
  telugu: 'NotoSansTelugu_400Regular',
  kannada: 'NotoSansKannada_400Regular',
  malayalam: 'NotoSansMalayalam_400Regular',
} as const;

const INDIC_FAMILY_KEYS = new Set<string>(Object.values(INDIC_SCRIPT_FAMILIES));

/** Latin faces in `APP_FONT_MAP`. Indic text on these faces is rerouted to a script Noto. */
const LATIN_ONLY_BUNDLED = new Set<string>([
  'Inter_400Regular',
  'Inter_600SemiBold',
  'Poppins_400Regular',
  'Poppins_700Bold',
  'Roboto_400Regular',
  'RobotoMono_400Regular',
  'OpenSans_400Regular',
  'Lato_400Regular',
  'Nunito_400Regular',
  'Montserrat_600SemiBold',
  'Raleway_400Regular',
  'Ubuntu_400Regular',
  'WorkSans_400Regular',
  'FiraSans_400Regular',
  'Rubik_400Regular',
  'SourceSans3_400Regular',
  'DMSans_400Regular',
  'Manrope_400Regular',
  'IBMPlexSans_400Regular',
  'PTSans_400Regular',
  'Merriweather_400Regular',
  'PlayfairDisplay_700Bold',
  'Oswald_500Medium',
]);

type ScriptRange = { start: number; end: number; family: string };

const SCRIPT_RANGES: readonly ScriptRange[] = [
  { start: 0x0900, end: 0x097f, family: INDIC_SCRIPT_FAMILIES.devanagari },
  { start: 0xa8e0, end: 0xa8ff, family: INDIC_SCRIPT_FAMILIES.devanagari },
  { start: 0x0980, end: 0x09ff, family: INDIC_SCRIPT_FAMILIES.bengali },
  { start: 0x0a00, end: 0x0a7f, family: INDIC_SCRIPT_FAMILIES.gurmukhi },
  { start: 0x0a80, end: 0x0aff, family: INDIC_SCRIPT_FAMILIES.gujarati },
  { start: 0x0b80, end: 0x0bff, family: INDIC_SCRIPT_FAMILIES.tamil },
  { start: 0x0c00, end: 0x0c7f, family: INDIC_SCRIPT_FAMILIES.telugu },
  { start: 0x0c80, end: 0x0cff, family: INDIC_SCRIPT_FAMILIES.kannada },
  { start: 0x0d00, end: 0x0d7f, family: INDIC_SCRIPT_FAMILIES.malayalam },
];

/** First bundled Indic script in `text`, ignoring Latin, digits, and punctuation. */
export function detectScriptFamily(text: string): string | undefined {
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code == null) continue;
    for (const range of SCRIPT_RANGES) {
      if (code >= range.start && code <= range.end) return range.family;
    }
  }
  return undefined;
}

export function isLatinOnlyBundledFace(familyKey?: string): boolean {
  return familyKey != null && LATIN_ONLY_BUNDLED.has(familyKey);
}

export function isIndicScriptFamily(familyKey?: string): boolean {
  return familyKey != null && INDIC_FAMILY_KEYS.has(familyKey);
}

/** Indic and other scripts that need HarfBuzz-style shaping (not raw glyph codes). */
export function needsComplexTextShaping(text: string): boolean {
  return detectScriptFamily(text) != null;
}

/**
 * Family key the editor and headless raster should draw.
 * `Default` stays unset for Latin so the system sans-serif is used.
 * Indic text on Default or a Latin bundled face uses the matching Noto.
 * An explicit Indian Noto choice is kept.
 */
export function resolveTextFontFamily(
  text: string,
  storedFontName: string | undefined,
  bundled: LookupFont[],
  installed: LookupInstalled[] = [],
): string | undefined {
  const requested = lookupFontFamily(storedFontName, bundled, installed);
  if (isIndicScriptFamily(requested)) return requested;
  const script = detectScriptFamily(text);
  if (script && (!requested || isLatinOnlyBundledFace(requested))) return script;
  return requested;
}

type RuntimeCatalog = {
  bundled: LookupFont[];
  installed: LookupInstalled[];
};

function runtimeCatalog(): RuntimeCatalog {
  try {
    const { FONT_LIBRARY } = require('@/constants/font-library') as { FONT_LIBRARY: LookupFont[] };
    const { useInstalledFontStore } = require('@/stores/installed-font-store') as {
      useInstalledFontStore: { getState: () => { items?: LookupInstalled[] } };
    };
    return {
      bundled: FONT_LIBRARY,
      installed: useInstalledFontStore.getState().items ?? [],
    };
  } catch {
    return { bundled: [], installed: [] };
  }
}

/** Canvas / ViewShot family for the string that will actually be drawn. */
export function resolveEditorFontFamily(text: string, storedFontName?: string): string | undefined {
  const { bundled, installed } = runtimeCatalog();
  return resolveTextFontFamily(text, storedFontName, bundled, installed);
}

/** Headless print family. Same rules as the editor. */
export function resolvePrintFontFamily(text: string, storedFontName?: string): string | undefined {
  return resolveEditorFontFamily(text, storedFontName);
}

type TextRun = { text: string; fontFamily?: string };

function pushRun(runs: TextRun[], text: unknown, fontFamily: unknown): void {
  if (typeof text !== 'string' || text.length === 0) return;
  runs.push({
    text,
    fontFamily: typeof fontFamily === 'string' ? fontFamily : undefined,
  });
}

/** Visible strings on a label, including table cells and barcode/QR payloads. */
export function collectTextRuns(doc: { elements: readonly object[] }): TextRun[] {
  const runs: TextRun[] = [];
  for (const element of doc.elements) {
    const record = element as {
      fontFamily?: unknown;
      text?: unknown;
      content?: unknown;
      cells?: unknown;
    };
    pushRun(runs, record.text, record.fontFamily);
    pushRun(runs, record.content, record.fontFamily);
    if (!Array.isArray(record.cells)) continue;
    for (const row of record.cells) {
      if (!Array.isArray(row)) continue;
      for (const cell of row) {
        if (!cell || typeof cell !== 'object') continue;
        const item = cell as { text?: unknown; fontFamily?: unknown };
        pushRun(runs, item.text, item.fontFamily ?? record.fontFamily);
      }
    }
  }
  return runs;
}

/** Families the raster must have loaded for this document. Unset Default/Latin is omitted. */
export function requiredPrintFamilyKeys(
  doc: { elements: readonly object[] },
  bundled: LookupFont[],
  installed: LookupInstalled[] = [],
): string[] {
  const keys = new Set<string>();
  for (const run of collectTextRuns(doc)) {
    const family = resolveTextFontFamily(run.text, run.fontFamily, bundled, installed);
    if (family) keys.add(family);
  }
  return [...keys];
}
