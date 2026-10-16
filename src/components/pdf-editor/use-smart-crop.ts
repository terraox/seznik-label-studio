/**
 * Smart Crop, Phase 2 — tap-to-select on the current page.
 *
 * - The page is read the moment the crop tool opens (plan R2.5), not when Smart
 *   Crop is pressed, so a tap nearly always has a buffer waiting.
 * - A tap that arrives before the buffer exists is queued and shown as busy at
 *   the tap point, then served when the buffer lands. Never a dead tap.
 * - Region-grow answers taps as soon as the page is prepared; full detection
 *   runs after, and its overlays appear when they exist (plan R1.1.6).
 * - Nothing here touches the session. The screen gets the selection's union
 *   rect through `onSelection` and keeps it as a draft until Apply Crop.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';

import { detectPrepared, prepareAnalysis, type AnalysisContext } from '@/lib/pdf-editor/smart-crop/detector';
import { toNorm } from '@/lib/pdf-editor/smart-crop/gray';
import { areaOf } from '@/lib/pdf-editor/smart-crop/hit-test';
import { screenToNorm } from '@/lib/pdf-editor/smart-crop/map';
import { resolveTapChain } from '@/lib/pdf-editor/smart-crop/resolve';
import {
  applyTap,
  emptySelection,
  selectionRect,
  selectOnly,
  type Selection,
  type TapOutcome,
} from '@/lib/pdf-editor/smart-crop/selection';
import { loadAnalysisGray } from '@/lib/pdf-editor/smart-crop/source';
import { leaves, sectionById, type DetectResult, type NormRect, type Section } from '@/lib/pdf-editor/smart-crop/types';

export type SmartCropStatus =
  /** Crop tool closed. */
  | 'idle'
  /** Reading the page. Taps wait. */
  | 'loading'
  /** Page read: taps work through region-grow while detection runs. */
  | 'ready'
  /** Detection finished. */
  | 'done'
  | 'error';

export type SmartCropNotice =
  | 'none-found'
  | 'low-confidence'
  | 'nothing-here'
  | 'big-block'
  | 'capped'
  | 'too-small'
  | 'hint-step'
  | 'error';

export type PdfCropOverlay = {
  id: string;
  rect: NormRect;
  /** Reading-order number, or null for a grown block or an outer group. */
  number: number | null;
  state: 'hint' | 'suggested' | 'selected';
  /** Shown on a selected overlay's badge. */
  label: string | null;
  a11yLabel: string;
};

/** Below this, the page "has no clear sections" (plan §5.5). */
const LOW_CONFIDENCE = 0.4;
/** A selection over this share of the content area gets the "one big block" note. */
const BIG_BLOCK = 0.45;
/** Repeat-tap radius in screen px (plan R1.1.2). */
const REPEAT_SLOP_PX = 8;

type Entry = {
  ctx: AnalysisContext;
  result: DetectResult | null;
  loadMs: { render: number; decode: number; downscale: number; prepare: number };
};

/** Prepared pages for this editor session, keyed `uri::page`. */
const cache = new Map<string, Entry>();

export function clearSmartCropCache() {
  cache.clear();
}

function afterInteractions(): Promise<void> {
  return new Promise((resolve) => {
    InteractionManager.runAfterInteractions(() => setTimeout(resolve, 0));
  });
}

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const box = (r: NormRect) => `${pct(r.x)},${pct(r.y)} ${pct(r.w)}×${pct(r.h)}`;

function describe(s: Section): string {
  if (s.source === 'grown') return `grown ${s.id}${s.note ? ` (${s.note})` : ''}`;
  if (s.kind === 'group') return `detected group ${s.id}${s.note ? ` (${s.note})` : ''}`;
  return `detected #${s.order} ${s.id} conf ${s.confidence}${s.note ? ` (${s.note})` : ''}`;
}

function badgeLabel(s: Section): string {
  if (s.source === 'grown') return 'Block';
  if (s.kind === 'group') return 'Larger block';
  return `Section ${s.order} · ${Math.round(s.confidence * 100)}%`;
}

function foundNotice(result: DetectResult): SmartCropNotice | null {
  const ls = leaves(result);
  if (ls.length === 0) return 'none-found';
  if (Math.max(...ls.map((s) => s.confidence)) < LOW_CONFIDENCE) return 'low-confidence';
  return null;
}

export type SmartCropSelectionInfo = {
  /** Union of everything selected, or null when the selection was cleared. */
  rect: NormRect | null;
  count: number;
  outcome: TapOutcome['kind'] | 'step' | 'clear';
};

export function useSmartCrop({
  sourceUri,
  pageIndex,
  active,
  pageMm,
  hintSeen,
  onHintSeen,
  onSelection,
}: {
  sourceUri: string | null;
  pageIndex: number;
  /** True while the crop tool is open. */
  active: boolean;
  /** Page size in mm, for spoken overlay labels. */
  pageMm: { w: number; h: number };
  hintSeen: boolean;
  onHintSeen: () => void;
  onSelection: (info: SmartCropSelectionInfo) => void;
}) {
  const [entry, setEntry] = useState<Entry | null>(null);
  const [status, setStatus] = useState<SmartCropStatus>('idle');
  const [selection, setSelection] = useState<Selection>(emptySelection);
  const [overlaysOn, setOverlaysOn] = useState(false);
  const [notice, setNotice] = useState<SmartCropNotice | null>(null);
  const [pending, setPending] = useState<{ x: number; y: number; slop: number } | null>(null);

  const entryRef = useRef<Entry | null>(null);
  const selRef = useRef<Selection>(selection);
  const onSelectionRef = useRef(onSelection);
  onSelectionRef.current = onSelection;
  const hintRef = useRef({ seen: hintSeen, mark: onHintSeen });
  hintRef.current = { seen: hintSeen, mark: onHintSeen };

  const commit = useCallback((sel: Selection, outcome: SmartCropSelectionInfo['outcome'], notify = true) => {
    selRef.current = sel;
    setSelection(sel);
    if (notify) onSelectionRef.current({ rect: selectionRect(sel), count: sel.items.length, outcome });
  }, []);

  // ── Read and prepare the page when the crop tool opens ────────────────────
  useEffect(() => {
    selRef.current = emptySelection();
    setSelection(selRef.current);
    setOverlaysOn(false);
    setNotice(null);
    setPending(null);
    if (!active || !sourceUri) {
      entryRef.current = null;
      setEntry(null);
      setStatus('idle');
      return;
    }

    const key = `${sourceUri}::${pageIndex}`;
    const hit = cache.get(key) ?? null;
    entryRef.current = hit;
    setEntry(hit);
    setStatus(hit ? (hit.result ? 'done' : 'ready') : 'loading');
    if (hit?.result) return;

    let cancelled = false;
    (async () => {
      try {
        let e = hit;
        if (!e) {
          const loaded = await loadAnalysisGray(sourceUri, pageIndex);
          if (cancelled) return;
          const ctx = prepareAnalysis(loaded.gray);
          e = {
            ctx,
            result: null,
            loadMs: {
              render: loaded.renderMs,
              decode: loaded.decodeMs,
              downscale: loaded.downscaleMs,
              prepare: ctx.prepareMs,
            },
          };
          cache.set(key, e);
          entryRef.current = e;
          setEntry(e);
          setStatus('ready');
        }

        await afterInteractions();
        if (cancelled) return;
        const t0 = now();
        const result = detectPrepared(e.ctx);
        const detectMs = now() - t0;
        e = { ...e, result };
        cache.set(key, e);
        if (cancelled) return;
        entryRef.current = e;
        setEntry(e);
        setStatus('done');
        if (__DEV__) {
          const l = e.loadMs;
          console.log(
            `[smart-crop] page ${pageIndex + 1} ready: render ${l.render.toFixed(1)}ms · decode ${l.decode.toFixed(1)}ms` +
              ` · downscale ${l.downscale.toFixed(1)}ms · prepare ${l.prepare.toFixed(1)}ms · detect ${detectMs.toFixed(1)}ms` +
              ` · ${leaves(result).length} sections`,
          );
        }
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        setNotice('error');
        if (__DEV__) console.log(`[smart-crop] page ${pageIndex + 1} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, sourceUri, pageIndex]);

  // ── Taps ──────────────────────────────────────────────────────────────────
  const serveTap = useCallback(
    (p: { x: number; y: number }, slop: number) => {
      const e = entryRef.current;
      if (!e) return;
      const { chain, via } = resolveTapChain(e.ctx, e.result, p);
      const { sel, outcome } = applyTap(selRef.current, chain, { ...p, at: Date.now() }, slop);

      if (__DEV__) {
        const head = `[smart-crop] tap (${p.x.toFixed(3)}, ${p.y.toFixed(3)})`;
        if (outcome.kind === 'nothing') console.log(`${head} → nothing there`);
        else {
          const s = outcome.section;
          const step = outcome.kind === 'stepped' ? ` step ${outcome.chainIndex + 1}/${outcome.chainLength}` : '';
          console.log(`${head} → ${outcome.kind}${step} ${describe(s)} ${box(s.rect)} · via ${via} · chain ${chain.length}`);
        }
      }

      if (outcome.kind === 'nothing') {
        setNotice('nothing-here');
        return;
      }
      commit(sel, outcome.kind);
      if (via === 'detected') setOverlaysOn(true);

      const s = outcome.section;
      const union = selectionRect(sel);
      const content = e.result?.contentRect ?? (e.ctx.content ? toNorm(e.ctx.content, e.ctx.page.width, e.ctx.page.height) : null);
      if (outcome.kind !== 'removed' && s.note === 'capped') setNotice('capped');
      else if (outcome.kind !== 'removed' && s.note === 'too-small') setNotice('too-small');
      else if (outcome.kind === 'added' && outcome.chainLength > 1 && !hintRef.current.seen) {
        setNotice('hint-step');
        hintRef.current.mark();
      } else if (union && content && areaOf(union) > BIG_BLOCK * areaOf(content)) setNotice('big-block');
      else setNotice(null);
    },
    [commit],
  );

  /** A stationary tap in the crop view: screen px within the stage, plus the stage size. */
  const tap = useCallback(
    (pt: { x: number; y: number }, stage: { w: number; h: number }) => {
      const p = screenToNorm(pt, { stageW: stage.w, stageH: stage.h });
      if (!p) return;
      const slop = REPEAT_SLOP_PX / Math.max(1, Math.min(stage.w, stage.h));
      if (!entryRef.current) {
        setPending({ ...p, slop });
        return;
      }
      serveTap(p, slop);
    },
    [serveTap],
  );

  // A tap that came in while the page was being read.
  useEffect(() => {
    if (!pending || !entry) return;
    setPending(null);
    serveTap({ x: pending.x, y: pending.y }, pending.slop);
  }, [entry, pending, serveTap]);

  // ── Smart Crop button, Prev / Next, clear, nudge ──────────────────────────
  const showAll = useCallback(() => {
    setOverlaysOn(true);
    const result = entryRef.current?.result;
    if (result) setNotice(foundNotice(result));
  }, []);

  // Overlays asked for before detection finished: report what was found once it has.
  useEffect(() => {
    if (status === 'done' && overlaysOn && entry?.result && selRef.current.items.length === 0) {
      setNotice((n) => n ?? foundNotice(entry.result!));
    }
  }, [status, overlaysOn, entry]);

  const step = useCallback(
    (dir: 1 | -1) => {
      const result = entryRef.current?.result;
      if (!result || result.visibleIds.length === 0) return;
      const ids = result.visibleIds;
      const current = selRef.current.items.length
        ? ids.indexOf(selRef.current.items[selRef.current.items.length - 1].id)
        : -1;
      const next = current < 0 ? (dir === 1 ? 0 : ids.length - 1) : (current + dir + ids.length) % ids.length;
      const s = sectionById(result, ids[next]);
      if (!s) return;
      setOverlaysOn(true);
      setNotice(null);
      commit(selectOnly(s), 'step');
      if (__DEV__) console.log(`[smart-crop] ${dir === 1 ? 'next' : 'prev'} → ${describe(s)} ${box(s.rect)}`);
    },
    [commit],
  );

  const clear = useCallback(() => {
    setNotice(null);
    commit(emptySelection(), 'clear');
  }, [commit]);

  /** Screen-reader activation of one overlay: select just that section. */
  const activate = useCallback(
    (id: string) => {
      const result = entryRef.current?.result;
      const s = (result && sectionById(result, id)) ?? selRef.current.items.find((it) => it.id === id) ?? null;
      if (!s) return;
      setNotice(null);
      commit(selectOnly(s), 'step');
    },
    [commit],
  );

  /** The window was dragged: drop the highlight, keep the window (plan R1.2.1). */
  const nudged = useCallback(() => {
    if (selRef.current.items.length === 0) return;
    setNotice(null);
    commit(emptySelection(), 'clear', false);
  }, [commit]);

  // ── Overlays ──────────────────────────────────────────────────────────────
  const overlays = useMemo<PdfCropOverlay[]>(() => {
    const mm = (r: NormRect) =>
      `${Math.round(r.w * pageMm.w)} by ${Math.round(r.h * pageMm.h)} millimetres`;
    const selectedIds = new Set(selection.items.map((s) => s.id));
    const out: PdfCropOverlay[] = [];
    const result = entry?.result;
    if (overlaysOn && result) {
      for (const id of result.visibleIds) {
        const s = sectionById(result, id);
        if (!s) continue;
        const selected = selectedIds.has(id);
        out.push({
          id,
          rect: s.rect,
          number: s.order,
          state: selected ? 'selected' : id === result.suggestedId ? 'suggested' : 'hint',
          label: selected ? badgeLabel(s) : id === result.suggestedId ? 'Suggested' : null,
          a11yLabel: `Section ${s.order}, ${mm(s.rect)}, ${Math.round(s.confidence * 100)} percent confident${selected ? ', selected' : ''}`,
        });
      }
    }
    for (const s of selection.items) {
      if (out.some((o) => o.id === s.id)) continue;
      out.push({
        id: s.id,
        rect: s.rect,
        number: s.kind === 'leaf' && s.order > 0 ? s.order : null,
        state: 'selected',
        label: badgeLabel(s),
        a11yLabel: `${badgeLabel(s)}, ${mm(s.rect)}, selected`,
      });
    }
    return out;
  }, [entry, overlaysOn, pageMm.h, pageMm.w, selection]);

  const result = entry?.result ?? null;
  const hiddenCount = result ? leaves(result).length - result.visibleIds.length : 0;
  const selectedSection = selection.items.length === 1 ? selection.items[0] : null;

  return {
    status,
    notice,
    overlays,
    overlaysOn,
    selectedCount: selection.items.length,
    selectedSection,
    selectedLabel: selectedSection ? badgeLabel(selectedSection) : null,
    hiddenCount: overlaysOn ? hiddenCount : 0,
    canStep: Boolean(result && result.visibleIds.length > 0),
    /** Page fractions of a tap waiting for the page to be read. */
    busyAt: pending ? { x: pending.x, y: pending.y } : null,
    tap,
    showAll,
    step,
    clear,
    nudged,
    activate,
  };
}

export type SmartCropController = ReturnType<typeof useSmartCrop>;
