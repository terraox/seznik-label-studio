/**
 * Smart Crop — recursive XY-cut section detector.
 *
 * Pure TypeScript over a grayscale buffer, so it runs the same in node tests
 * and on device. No OCR, no network, no native calls. See SMART_CROP_PLAN.md
 * §2 for the design and R2.2-R2.4 for the classification rules.
 */

import { buildCodeMap, type CodeMap } from './codes';
import {
  binarize,
  Integral,
  inkBounds,
  measureTone,
  padRect,
  toAnalysisGray,
  toNorm,
  type InkMask,
  type Tone,
} from './gray';
import { lineProfile, type LineProfile } from './profile';
import { axisScale, resolveOptions, type AxisScale, type DetectOptions, type Scale } from './params';
import { findSeparators, hasCodeLike, type Separator } from './rules';
import type {
  DetectResult,
  DroppedSection,
  EdgeKind,
  GrayPage,
  PxRect,
  Section,
  SectionKind,
  SeparatorKind,
} from './types';

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

const EDGE_FOR_KIND: Record<SeparatorKind, EdgeKind> = {
  dashed: 'dashed',
  solid: 'solid',
  band: 'band',
  gutter: 'gutter',
};

type Edges = { top: EdgeKind; right: EdgeKind; bottom: EdgeKind; left: EdgeKind };

type Node = {
  id: string;
  rect: PxRect;
  depth: number;
  parentId: string | null;
  edges: Edges;
  /** Score of the cut that created this node. The root starts neutral. */
  cutQuality: number;
  kind: SectionKind;
  codeLike: boolean;
  inkRatio: number;
};

type Cut = { sep: Separator; score: number };

function area(r: PxRect): number {
  return Math.max(0, r.w) * Math.max(0, r.h);
}

/** Child-region checks for `pickCut`, bound to this run's buffers. */
type ChildCheck = {
  /** The child has no ink worth a section — refusing keeps blank margins from becoming groups. */
  blank: (r: PxRect) => boolean;
  /**
   * The child is a solid fill — a banner or a bare band. That is content of its
   * neighbour (or a separator), never a section of its own (plan R2.10).
   */
  solid: (r: PxRect) => boolean;
};

/**
 * Best cut for one node, or null. A separator only qualifies if both halves
 * clear `minArea` — that single test is what keeps a barcode from splitting a
 * label and an invoice table from shattering into rows — and neither half is
 * blank or a solid fill.
 */
function pickCut(seps: Separator[], node: PxRect, scale: Scale, check: ChildCheck): Cut | null {
  let best: Cut | null = null;
  for (const sep of seps) {
    const nodeStart = sep.axis === 'h' ? node.y : node.x;
    const nodeExtent = sep.axis === 'h' ? node.h : node.w;
    const nodeEnd = nodeStart + nodeExtent;
    if (sep.start <= nodeStart || sep.end >= nodeEnd) continue;

    const aExtent = sep.start - nodeStart;
    const bExtent = nodeEnd - sep.end;
    if (aExtent < 1 || bExtent < 1) continue;

    const across = sep.axis === 'h' ? node.w : node.h;
    const areaA = aExtent * across;
    const areaB = bExtent * across;
    if (areaA < scale.minAreaPx || areaB < scale.minAreaPx) continue;

    const balance = 0.6 + 0.4 * (Math.min(areaA, areaB) / Math.max(areaA, areaB));
    const score = sep.baseScore * balance;
    if (best && score <= best.score) continue;

    const [a, b] = splitRect(node, sep);
    if (check.blank(a) || check.blank(b) || check.solid(a) || check.solid(b)) continue;
    best = { sep, score };
  }
  return best;
}

function splitRect(node: PxRect, sep: Separator): [PxRect, PxRect] {
  if (sep.axis === 'h') {
    return [
      { x: node.x, y: node.y, w: node.w, h: sep.start - node.y },
      { x: node.x, y: sep.end, w: node.w, h: node.y + node.h - sep.end },
    ];
  }
  return [
    { x: node.x, y: node.y, w: sep.start - node.x, h: node.h },
    { x: sep.end, y: node.y, w: node.x + node.w - sep.end, h: node.h },
  ];
}

/**
 * Everything the detector and region-grow share, built once per page. It is
 * cheap — one threshold pass, an integral image and the code map — so a tap
 * can be served by region-grow before the full cut has run (plan R1.1.6).
 */
export type AnalysisContext = {
  page: GrayPage;
  opts: DetectOptions;
  tone: Tone;
  mask: InkMask;
  it: Integral;
  codes: CodeMap;
  full: PxRect;
  /** Padded ink bounds of the whole page, or null for a blank page. */
  content: PxRect | null;
  scale: Scale | null;
  asH: AxisScale | null;
  asV: AxisScale | null;
  edgeInkRow: number;
  edgeInkCol: number;
  downscaleMs: number;
  prepareMs: number;
};

export function prepareAnalysis(source: GrayPage, options?: Partial<DetectOptions>): AnalysisContext {
  const opts = resolveOptions(options);
  const t0 = now();

  const page = toAnalysisGray(source, opts.analysisLongEdge);
  const tDownscale = now();

  const tone = measureTone(page, opts);
  const mask = binarize(page, tone.inkMax);
  const it = new Integral(mask);
  const full: PxRect = { x: 0, y: 0, w: page.width, h: page.height };
  const edgeInkRow = Math.max(opts.edgeInkMin, opts.edgeInk * page.width);
  const edgeInkCol = Math.max(opts.edgeInkMin, opts.edgeInk * page.height);
  const contentPx = inkBounds(it, full, edgeInkRow, edgeInkCol);
  const unit = Math.max(page.width, page.height);
  const codes = buildCodeMap(mask, unit, opts);

  let content: PxRect | null = null;
  let scale: Scale | null = null;
  let asH: AxisScale | null = null;
  let asV: AxisScale | null = null;
  if (contentPx) {
    content = padRect(contentPx, 2, full);
    scale = {
      unit,
      contentW: content.w,
      contentH: content.h,
      contentArea: Math.max(1, content.w * content.h),
      pageW: page.width,
      pageH: page.height,
      paperLevel: tone.paperLevel,
      inkMax: tone.inkMax,
      minAreaPx: opts.minArea * Math.max(1, content.w * content.h),
      padPx: Math.max(1, Math.round(opts.pad * unit)),
    };
    asH = axisScale(scale, 'h', opts);
    asV = axisScale(scale, 'v', opts);
  }

  return {
    page,
    opts,
    tone,
    mask,
    it,
    codes,
    full,
    content,
    scale,
    asH,
    asV,
    edgeInkRow,
    edgeInkCol,
    downscaleMs: tDownscale - t0,
    prepareMs: now() - tDownscale,
  };
}

/** Prepare and detect in one call. */
export function detectSections(source: GrayPage, options?: Partial<DetectOptions>): DetectResult {
  return detectPrepared(prepareAnalysis(source, options));
}

const ms2 = (v: number) => Number(v.toFixed(2));

function timingOf(ctx: AnalysisContext, cutMs: number) {
  return {
    downscaleMs: ms2(ctx.downscaleMs),
    prepareMs: ms2(ctx.prepareMs),
    cutMs: ms2(cutMs),
    totalMs: ms2(ctx.downscaleMs + ctx.prepareMs + cutMs),
  };
}

/** The recursive cut over an already prepared page. */
export function detectPrepared(ctx: AnalysisContext): DetectResult {
  const { page, opts, tone, mask, it, codes, full, edgeInkRow, edgeInkCol } = ctx;
  const tCut = now();

  if (!ctx.content || !ctx.scale || !ctx.asH || !ctx.asV) {
    return {
      sections: [],
      visibleIds: [],
      dropped: [],
      contentRect: toNorm(full, page.width, page.height),
      analysis: { w: page.width, h: page.height },
      tone,
      timing: timingOf(ctx, now() - tCut),
      suggestedId: null,
    };
  }
  const content = ctx.content;
  const scale = ctx.scale;
  const asH = ctx.asH;
  const asV = ctx.asV;

  /**
   * A dashed rule lying on the edge of the content with only blank paper
   * between it and the content beyond is a cut-line marker (Amazon prints one
   * along the bottom of the label and invoice). Strip it so it does not end up
   * inside the sections either side. Solid edge rules are kept: on a bordered
   * label box they are the box itself.
   */
  const peelEdgeDashes = (rect: PxRect): PxRect => {
    let cur = rect;
    for (let pass = 0; pass < 4; pass++) {
      const ph = lineProfile(page, mask, cur, 'h', asH.dashGapPx, opts.toneTol);
      const pv = lineProfile(page, mask, cur, 'v', asV.dashGapPx, opts.toneTol);
      const seps = [
        ...findSeparators(page, mask, it, codes, cur, ph, asH, scale, opts).accepted,
        ...findSeparators(page, mask, it, codes, cur, pv, asV, scale, opts).accepted,
      ].filter((sep) => sep.kind === 'dashed');

      let next: PxRect | null = null;
      for (const sep of seps) {
        const lo = sep.axis === 'h' ? cur.y : cur.x;
        const hi = lo + (sep.axis === 'h' ? cur.h : cur.w);
        const nearEdge = scale.padPx * 2 + 2;
        let keep: PxRect | null = null;
        if (hi - sep.end <= nearEdge) {
          keep = sep.axis === 'h'
            ? { x: cur.x, y: cur.y, w: cur.w, h: sep.start - cur.y }
            : { x: cur.x, y: cur.y, w: sep.start - cur.x, h: cur.h };
        } else if (sep.start - lo <= nearEdge) {
          keep = sep.axis === 'h'
            ? { x: cur.x, y: sep.end, w: cur.w, h: cur.y + cur.h - sep.end }
            : { x: sep.end, y: cur.y, w: cur.x + cur.w - sep.end, h: cur.h };
        }
        if (!keep || keep.w < 1 || keep.h < 1) continue;
        const tight = inkBounds(it, keep, edgeInkRow, edgeInkCol);
        if (tight && area(tight) >= scale.minAreaPx) {
          next = padRect(tight, 2, keep);
          break;
        }
      }
      if (!next) break;
      cur = next;
    }
    return cur;
  };

  const check: ChildCheck = {
    blank: (r) => {
      const tight = inkBounds(
        it,
        r,
        Math.max(opts.edgeInkMin, opts.edgeInk * r.w),
        Math.max(opts.edgeInkMin, opts.edgeInk * r.h),
      );
      return !tight || it.ratio(tight) < opts.minInk;
    },
    solid: (r) => {
      const tight = inkBounds(
        it,
        r,
        Math.max(opts.edgeInkMin, opts.edgeInk * r.w),
        Math.max(opts.edgeInkMin, opts.edgeInk * r.h),
      );
      return Boolean(tight) && it.ratio(tight!) >= opts.bandSolidity;
    },
  };

  const root = peelEdgeDashes(content);

  const nodes: Node[] = [];
  const dropped: DroppedSection[] = [];
  let nextId = 0;

  const visit = (rect: PxRect, depth: number, parentId: string | null, edges: Edges, cutQuality: number) => {
    const node: Node = {
      id: `s${nextId++}`,
      rect,
      depth,
      parentId,
      edges,
      cutQuality,
      kind: 'leaf',
      codeLike: false,
      inkRatio: it.ratio(rect),
    };
    nodes.push(node);

    const ph: LineProfile = lineProfile(page, mask, rect, 'h', asH.dashGapPx, opts.toneTol);
    const pv: LineProfile = lineProfile(page, mask, rect, 'v', asV.dashGapPx, opts.toneTol);
    node.codeLike = hasCodeLike(codes, rect, opts);

    if (area(rect) < scale.minAreaPx * 2) return;

    const sh = findSeparators(page, mask, it, codes, rect, ph, asH, scale, opts);
    const sv = findSeparators(page, mask, it, codes, rect, pv, asV, scale, opts);
    const cut = pickCut([...sh.accepted, ...sv.accepted], rect, scale, check);
    if (!cut) return;

    if (depth >= opts.maxDepth || nodes.length + 2 > opts.maxRegions) {
      // A real boundary was found but we are out of budget. Say so rather than
      // silently returning a region the user will think is a detection failure.
      dropped.push({ rect: toNorm(rect, page.width, page.height), reason: 'depth-cap' });
      return;
    }

    node.kind = 'group';
    const edge = EDGE_FOR_KIND[cut.sep.kind];
    const [a, b] = splitRect(rect, cut.sep);
    if (cut.sep.axis === 'h') {
      visit(a, depth + 1, node.id, { ...edges, bottom: edge }, cut.score);
      visit(b, depth + 1, node.id, { ...edges, top: edge }, cut.score);
    } else {
      visit(a, depth + 1, node.id, { ...edges, right: edge }, cut.score);
      visit(b, depth + 1, node.id, { ...edges, left: edge }, cut.score);
    }
  };

  const rootEdges: Edges = { top: 'content', right: 'content', bottom: 'content', left: 'content' };
  visit(root, 0, null, rootEdges, 0.5);

  // ── Tighten leaves to their own ink ───────────────────────────────────────
  const kept: Node[] = [];
  for (const node of nodes) {
    if (node.kind !== 'leaf') {
      kept.push(node);
      continue;
    }
    const rowInk = Math.max(opts.edgeInkMin, opts.edgeInk * node.rect.w);
    const colInk = Math.max(opts.edgeInkMin, opts.edgeInk * node.rect.h);
    const tight = inkBounds(it, node.rect, rowInk, colInk);
    if (!tight) {
      dropped.push({ rect: toNorm(node.rect, page.width, page.height), reason: 'below-min-ink' });
      continue;
    }

    const gap = scale.padPx * 2;
    const edges: Edges = { ...node.edges };
    const inward = {
      top: tight.y - node.rect.y,
      left: tight.x - node.rect.x,
      bottom: node.rect.y + node.rect.h - (tight.y + tight.h),
      right: node.rect.x + node.rect.w - (tight.x + tight.w),
    };
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      if (inward[side] > gap && (edges[side] === 'content' || edges[side] === 'none')) {
        edges[side] = 'ink-gap';
      }
    }

    const padded = padRect(tight, scale.padPx, node.rect);
    if (area(padded) < scale.minAreaPx) {
      dropped.push({ rect: toNorm(padded, page.width, page.height), reason: 'below-min-area' });
      continue;
    }
    const inkRatio = it.ratio(padded);
    if (inkRatio < opts.minInk) {
      dropped.push({ rect: toNorm(padded, page.width, page.height), reason: 'below-min-ink' });
      continue;
    }
    kept.push({ ...node, rect: padded, edges, inkRatio });
  }

  // ── Reading order, confidence, suggestion ─────────────────────────────────
  const leafNodes = kept.filter((n) => n.kind === 'leaf');
  const yBucket = (n: Node) => Math.round(n.rect.y / Math.max(1, 0.02 * page.height));
  leafNodes.sort((a, b) => yBucket(a) - yBucket(b) || a.rect.x - b.rect.x);
  const orderById = new Map<string, number>();
  leafNodes.forEach((n, i) => orderById.set(n.id, i + 1));

  const confidenceOf = (n: Node): number => {
    const edgeScore =
      (['top', 'right', 'bottom', 'left'] as const).filter((s) => n.edges[s] !== 'none').length / 4;
    const inkScore = Math.max(0, 1 - Math.abs(n.inkRatio - 0.18) / 0.5);
    const raw =
      0.4 * Math.min(1, Math.max(0, n.cutQuality)) +
      0.3 * edgeScore +
      0.2 * inkScore +
      0.1 * (n.codeLike ? 1 : 0);
    return Math.min(0.99, Math.max(0.1, Number(raw.toFixed(3))));
  };

  const sections: Section[] = kept.map((n) => ({
    id: n.id,
    kind: n.kind,
    parentId: n.parentId,
    depth: n.depth,
    rect: toNorm(n.rect, page.width, page.height),
    confidence: confidenceOf(n),
    inkRatio: Number(n.inkRatio.toFixed(4)),
    hasCodeLike: n.codeLike,
    boundedBy: n.edges,
    order: orderById.get(n.id) ?? -1,
    source: 'detected' as const,
  }));
  sections.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'leaf' ? -1 : 1;
    if (a.kind === 'leaf') return a.order - b.order;
    return a.depth - b.depth || a.rect.y - b.rect.y || a.rect.x - b.rect.x;
  });

  const leafSections = sections.filter((s) => s.kind === 'leaf');
  const visible = [...leafSections]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, opts.visibleCap);
  const visibleSet = new Set(visible.map((s) => s.id));
  for (const s of leafSections) {
    if (!visibleSet.has(s.id)) dropped.push({ rect: s.rect, reason: 'over-cap' });
  }
  const visibleIds = leafSections.filter((s) => visibleSet.has(s.id)).map((s) => s.id);

  const suggested = [...visible].sort(
    (a, b) =>
      Number(b.hasCodeLike) - Number(a.hasCodeLike) ||
      b.rect.w * b.rect.h - a.rect.w * a.rect.h ||
      a.rect.x + a.rect.y - (b.rect.x + b.rect.y),
  )[0];

  return {
    sections,
    visibleIds,
    dropped,
    contentRect: toNorm(content, page.width, page.height),
    analysis: { w: page.width, h: page.height },
    tone,
    timing: timingOf(ctx, now() - tCut),
    suggestedId: suggested?.id ?? null,
  };
}
