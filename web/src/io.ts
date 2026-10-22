import { DRAWING_COLORS } from '@/components/editor/types';
import { BORDER_LIBRARY, resolveBorderStyle } from '@/constants/border-library';
import { buildSezlabel, type ExportResult } from '@/lib/label-share/export';
import { finalizeDocument, type PlacedImage } from '@/lib/label-share/finalize';
import { sniffImage } from '@/lib/label-share/image-sniff';
import { parseSezlabel, type ParsedLabel } from '@/lib/label-share/import';
import { sanitizeSvgStrict } from '@/lib/label-share/svg-strict';
import { newId } from './defaults';

/** Pictures and own clipart held in memory (the phone keeps these as files). */
export type ImageAsset = { bytes: Uint8Array; mime: string; url: string; width: number; height: number };
export type ClipartAsset = { label: string; kind: 'svg' | 'image'; svg?: string; bytes?: Uint8Array; mime: string; url: string; width?: number; height?: number };

export const images = new Map<string, ImageAsset>();
export const clipart = new Map<string, ClipartAsset>();

const MIME = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' } as const;
let counter = 0;

export function addImage(bytes: Uint8Array): { key: string; asset: ImageAsset } | null {
  const s = sniffImage(bytes);
  if (!s || s.kind === 'webp') return null;
  const mime = MIME[s.kind];
  const key = `web-img://${(counter += 1)}`;
  const asset = { bytes, mime, url: URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime })), width: s.width, height: s.height };
  images.set(key, asset);
  return { key, asset };
}

export function addClipartFile(label: string, bytes: Uint8Array, isSvg: boolean): string | null {
  const id = newId('svg');
  if (isSvg) {
    const svg = sanitizeSvgStrict(new TextDecoder().decode(bytes));
    if (!svg) return null;
    clipart.set(id, { label, kind: 'svg', svg, mime: 'image/svg+xml', url: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` });
    return id;
  }
  const s = sniffImage(bytes);
  if (!s) return null;
  const mime = MIME[s.kind];
  clipart.set(id, { label, kind: 'image', bytes, mime, width: s.width, height: s.height, url: URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime })) });
  return id;
}

export const imageUrl = (uri: string) => images.get(uri)?.url ?? null;
export const clipartUrl = (id: string) => clipart.get(id)?.url ?? null;

const fontOk = (name: string) => {
  if (name === 'Default' || name === 'Barcode') return true;
  try {
    return document.fonts.check(`12px "${name.replace(/"/g, '')}"`);
  } catch {
    return false;
  }
};

export type Opened = { doc: any; parsed: ParsedLabel };

/** Read a .sezlabel with the same validator the phone uses and build the document in memory. */
export function openSezlabel(bytes: Uint8Array): Opened {
  const parsed = parseSezlabel(bytes, {
    appVersion: '999.0.0', // the bench reads any schema this code understands
    palette: DRAWING_COLORS,
    newId: () => newId(),
    isKnownClipartId: () => true, // the built-in library lives in the phone app; unknown art shows as a labelled box
    isKnownBorderStyle: (id) => id === 'solid-medium' || resolveBorderStyle(id) !== 'solid-medium' || BORDER_LIBRARY.some((i) => i.id === id),
    isFontAvailable: fontOk,
  });
  const placed = new Map<string, PlacedImage>();
  for (const path of parsed.usedAssets) {
    const a = parsed.assets.get(path);
    if (!a || a.kind !== 'image') continue;
    const added = addImage(a.bytes);
    if (!added) continue;
    placed.set(path, {
      printUri: added.key, uri: added.key, workingWidthPx: a.width ?? 1, workingHeightPx: a.height ?? 1,
      widthPx: a.width ?? 1, heightPx: a.height ?? 1, fileName: path.split('/').pop() ?? 'ref',
    });
  }
  const clipartIds = new Map<string, string>();
  for (const c of parsed.userClipart) {
    const a = parsed.assets.get(c.path);
    if (!a) continue;
    const id = addClipartFile(c.label, a.bytes, c.kind === 'svg');
    if (id) clipartIds.set(c.oldId, id);
  }
  // Fonts packed in the file are made available to the preview (the phone installs them for real).
  for (const f of parsed.fonts) {
    try {
      const face = new FontFace(f.family, f.bytes.slice().buffer as ArrayBuffer);
      void face.load().then(() => document.fonts.add(face));
    } catch {
      // The preview falls back to the system font.
    }
  }
  const doc = finalizeDocument(parsed, { id: newId('label'), name: parsed.document.name, now: Date.now(), images: placed, clipartIds });
  return { doc, parsed };
}

async function previewPng(svg: string, widthPx: number, heightPx: number): Promise<Uint8Array | null> {
  try {
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await img.decode();
    const scale = 512 / Math.max(widthPx, heightPx);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(widthPx * scale));
    canvas.height = Math.max(1, Math.round(heightPx * scale));
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

/** Build the .sezlabel exactly as the phone does (same code), from the bench's in-memory label. */
export async function exportSezlabel(doc: any, opts: { includeUserClipart: boolean; previewSvg?: { svg: string; w: number; h: number } }): Promise<ExportResult> {
  const preview = opts.previewSvg ? await previewPng(opts.previewSvg.svg, opts.previewSvg.w, opts.previewSvg.h) : null;
  return buildSezlabel(doc, {
    appVersion: 'web-lab',
    palette: DRAWING_COLORS,
    now: () => Date.now(),
    includeUserClipart: opts.includeUserClipart,
    includeFonts: false, // the bench has no installed-font store to read from
    getImportedFont: async () => null,
    preview,
    readImage: async (uri) => images.get(uri)?.bytes ?? null,
    readReferenceImage: async () => null,
    getUserClipart: async (id) => {
      const c = clipart.get(id);
      if (!c) return null;
      return { id, label: c.label, kind: c.kind, svg: c.svg, bytes: c.bytes, widthPx: c.width, heightPx: c.height };
    },
  });
}
