# Smart Crop for the PDF Editor — Implementation Plan

Status: **plan only, nothing implemented.** Build phase by phase, stop after each phase.

> The three sample pages were described in the brief but no image files arrived with it.
> Layout facts below come from the written descriptions (A Amazon, B Flipkart, C Valmo/Meesho).
> Before Phase 1 ships, the real redacted PDFs are needed to lock the fixture tolerances.

---

## Phase tracker

- [ ] **Phase 0** — Current-state report (this document, section 1)
- [ ] **Phase 1** — Detector + node tests (`src/lib/pdf-editor/smart-crop/`), no UI
- [ ] **Phase 2** — Tap-to-select + region-grow + multi-select on the current page
- [ ] **Phase 3** — Per-page matching for All pages / Range (`cropByPage`)
- [ ] **Phase 4** — Rotation (/Rotate vs MediaBox) and skew handling
- [ ] **Phase 5** — Performance and background scheduling
- [ ] **Phase 6** — *(optional)* text-layer hint, iOS PDFKit only
- [ ] **Phase 7** — *(later)* section naming (label vs invoice) — out of scope now

---

## 1. Current-state report (Step 0)

Read-only. Nothing was changed.

### 1.1 Page rasterization

| Thing | Where | What it does |
|---|---|---|
| JS wrapper | `src/lib/pdf-editor/raster.ts` | `rasterPdfPageCached(uri, pageIndex, dpi)`; `prefetchNeighborPages`; `clearRasterCache` |
| Native module | `modules/pdf-raster/src/index.ts` | `renderPdfPage(uri, pageIndex, dpi) → RasteredPdfPage` |
| Android | `modules/pdf-raster/android/.../PdfRasterModule.kt` | `PdfRenderer` + `RENDER_MODE_FOR_PRINT`, ARGB_8888, white-filled, PNG to `cacheDir` |
| iOS | `modules/pdf-raster/ios/PdfRasterModule.swift` | PDFKit, `page.bounds(for: .mediaBox)`, `UIGraphicsImageRenderer`, PNG to tmp |

Return shape (`modules/pdf-raster/src/index.ts:3`):

```ts
type RasteredPdfPage = {
  uri: string;        // file:// PNG on disk
  widthPx: number; heightPx: number;
  widthPt: number; heightPt: number;   // page size as the RENDERER sees it
  pageCount: number;
};
```

- **DPI.** `PREVIEW_DPI = EXPORT_DPI = 300` (`raster.ts:3`). The screen does not always use 300: `src/app/pdf.tsx:318-338` picks 150 / 225 / 300 from how much the label actually needs, with a floor of 150 while the crop tool is open.
- **Cache.** A plain `Map` keyed `uri::pageIndex::dpi`, never evicted, cleared on screen unmount (`src/app/pdf.tsx:115-120`). Adding a new DPI adds a new cache entry and does not disturb the preview entries.
- **Can pixel data be read? Yes, already, in JS.** The module hands back only a PNG path, but two decoders are in the tree and the PDF editor already uses one:
  - `pngBase64ToGray(base64) → GrayRaster { width, height, gray: Uint8Array }`, one byte per pixel, `0 = black` — `src/lib/printer/escpos.ts:271`. Used today at `src/lib/pdf-editor/export.ts:437`.
  - `decodePng(bytes)` for full RGBA — `src/lib/fast-png-shim.ts:84` (a `TextDecoder('latin1')` shim around `fast-png`, needed on Hermes). Used at `src/lib/pdf-editor/export.ts` in the raster path.
  - So no new dependency and no native change is required to get a grayscale buffer.

### 1.2 Session data model

`src/lib/pdf-editor/session.ts` — `PdfEditSession` (line 154). Store: `src/stores/pdf-edit-store.ts` (zustand, **not** persisted; `resetSession()` on unmount).

```ts
type PdfCrop = {
  scope: PageScope;                         // 'this' | 'all' | 'range'
  originNorm: { x: number; y: number };     // top-left, fractions
  sizeNorm?: { w: number; h: number };      // fractions; absent = legacy mm-driven window
};
```

- **One** crop object for the whole session, with a page scope. `rotationByPage`, `sharpnessByPage`, `colorModeByPage` are per-page arrays; crop is not.
- Helpers already present: `clampCropNorm`, `defaultCropWindow`, `cropAspectForLabel`, `snapCropToAspect`, `cropWindowPts`, `resolveScopeIndices`, `mmToPt` / `ptToMm`.

### 1.3 Crop tool and output-size chips

- Screen: `src/app/pdf.tsx` (`tool === 'crop'`, `openCrop` / `applyCrop` / `removeCrop` at lines 272-293). Crop is edited as `draftCrop` local state and only written to the session on **Apply Crop**.
- Panel: `src/components/pdf-editor/pdf-crop-tool.tsx` — selected-area mm readout, "Match label shape" switch, Apply/Cancel, "Remove crop", scope selector.
- Interactive window: `src/components/pdf-editor/pdf-page-viewer.tsx`.

**Correction to the brief — the crop window is not fixed-size-pan-only.** `cropGesture` (`pdf-page-viewer.tsx:287-383`) is a single `Gesture.Pan().minDistance(0)` whose `onBegin` builds a grab-zone bitmask: `1` left edge, `2` right, `4` top, `8` bottom, `16` inside (move). Corners and edges **resize freely**. Tuning constants: `CROP_MIN = 40`, `CROP_GRAB = 30`, `CROP_SLOP = 18` screen px (lines 20-22). `aspectLock` constrains the ratio only when "Match label shape" is on, and that switch **defaults to off** (`src/app/pdf.tsx:111`).

Other viewer facts that matter for Phase 2:
- No pinch-zoom on the page in crop mode. The page is fitted to the measured box (`expand` path, `layout` memo).
- While `cropEnabled`, the content is drawn **unrotated** (`contentTurn = 0`, line ~170) and the clip is disabled — so tap coordinates and detector coordinates are in the same frame.
- The gesture is attached to one `<GestureDetector>` over `StyleSheet.absoluteFill` covering the whole stage (line ~540). Any tap handler must be composed into that same detector, not stacked on top.

Output size: `OutputSize { kind, widthMm, heightMm }`, presets `3x4 / 3x5 / 4x4 / 4x6`, default `custom 50×30 mm` (`session.ts:15-35`). UI is `src/components/pdf-editor/pdf-output-size-row.tsx` → `LabelSizeSetupSection`. `sizeFromMm()` snaps to a preset within 0.15 mm, otherwise returns `kind: 'custom'` — so writing an arbitrary mm size from a detected region already produces a Custom size with no extra work.

### 1.4 How crop is applied at export

`src/lib/pdf-editor/export.ts` → `composeEditedPages` (line 265).

For each page: if `sharpness > 0` **or** cropped **or** rotated, take the raster path —

```
rasterPdfPageCached(uri, i, EXPORT_DPI=300)
  → decodePng
  → cropRgbaNorm(origin, size)      // top-left fractions of the RENDERED bitmap  (export.ts:220)
  → rotateRgba(…, rotationByPage[i])
  → unsharpRgba
  → encodePng → out.embedPng
  → addPage(outputPagePts) + containInBox fit
```

otherwise `out.embedPage(srcDoc.getPage(i))`.

- `cropRgba` (line 239), the points-based variant driven by `cropWindowPts`, is the **legacy fallback** used only when `sizeNorm` is missing.
- Print path: `renderEditedPdfPages` (line 419) re-composes, re-renders at printer DPI and returns `GrayRaster` per page.

**Correction to the brief — crop is not normalized to the unrotated MediaBox.** `cropRgbaNorm` measures fractions of the **rendered bitmap**, and `src/app/pdf.tsx:112` keeps `rasterPt` (the renderer's own `widthPt/heightPt`) and prefers it over `session.pageSizesPt` precisely so the fractions and the mm readout agree with the bitmap. This makes conflict 3 much smaller than stated — see §4.3.

### 1.5 Prior art to reuse (do not rewrite)

| Reuse | Where |
|---|---|
| `GrayRaster` type, `pngBase64ToGray`, `trimGrayInkBounds`, `cropGrayRect`, `downsampleGrayToSize`, `rotateGray`, `binarizeGrayForPrint` | `src/lib/printer/escpos.ts` |
| `findLabelCropNorm` — percentile ink threshold (p90 − 12, clamped 40…236) + global ink bbox; `expandLabelCropNorm`; `clampLabelCropNorm` | `src/lib/img-to-label-engine.ts:251-320` |
| `detectLabelContour`, **`createSyntheticLabelImage`** (synthetic fixture generator) | `src/printing/contour-detection.ts` |
| Hit-test helper shape to copy | `src/lib/editor/table-cells.ts:121-181`, `src/lib/editor/image-crop-math.ts:159` |
| Tap-vs-drag gesture composition to copy | `src/components/editor/skia-canvas.tsx:517-553` — `Gesture.Race(drag, Gesture.Exclusive(doubleTap, tapSelect))`, tap is `.maxDuration(300)` |
| Pinch/pan/tap composition | `src/components/editor/zoomable-edit-pad.tsx:281-297` |

### 1.6 Tests and tooling

- Convention: plain `node:assert` + `console.log` headers, run with `npx --yes tsx --tsconfig tsconfig.json --test <files>`. Existing example: `src/lib/pdf-editor/__tests__/session.test.ts`.
- There is **no** `test:pdf-editor` script in `package.json` — `session.test.ts` is currently never run by any script. Phase 1 adds `test:smart-crop` and, while we are there, a `test:pdf-editor` script.
- `fixtures/` exists and holds only `fixtures/phase4/`. `.gitignore` has no PDF rules yet.

### 1.7 Text layer availability (assessed, not assumed)

- `pdf-lib` cannot extract text — confirmed, it has no text API.
- **iOS: feasible and cheap.** `modules/pdf-raster/ios/PdfRasterModule.swift` already imports PDFKit. `PDFPage.string` plus `PDFPage.selection(for:)` / `PDFSelection.bounds(for:)` give strings with rects, no new dependency, ~10 lines of Swift.
- **Android: not feasible cheaply.** `PdfRenderer` has no text API at all. Getting text positions means a new native dependency (PdfBox-Android or similar) plus a dev-client rebuild.
- `@react-native-ml-kit/text-recognition` is installed but that is OCR, which the brief rules out.
- This project is Android-primary (TD404/Josh printer modules, `adb reverse` dev scripts, `build:android` scripts).

**Verdict: the text-layer hint is not cheaply available on the primary platform.** Geometry plus manual adjust carries Phase 1-5. Phase 6 keeps it as an optional, platform-gated **confidence bonus only** — never a hard boundary — so behaviour never differs between platforms in a way the user can trip over.

### 1.8 One thing to settle before any code

`AGENTS.md` says to read `https://docs.expo.dev/versions/v57.0.0/`, but `package.json` pins `expo ~54.0.37` with SDK-54-matched packages (`expo-router ~6.0.24`, `react-native 0.81.5`). No code in this plan needs a new Expo API, so this does not block the plan — but it must be resolved before Phase 2 touches gesture or file-system code. See open question Q1.

---

## 2. Detector design

Location: `src/lib/pdf-editor/smart-crop/` — pure TypeScript, no React, no Skia, no native. Unit-testable in node.

```
smart-crop/
  types.ts     — Section, DetectResult, DetectOptions
  params.ts    — every threshold, all relative to page size
  gray.ts      — analysis buffer + binarize + integral image
  rules.ts     — dash merge, rule/band/gutter candidates, barcode guard
  detector.ts  — recursive XY-cut, tighten, confidence
  grow.ts      — region-grow from a tap point
  hit-test.ts  — point → section, nesting, repeat-tap stepping
  map.ts       — screen px ↔ analysis px ↔ normalized rect
```

### 2.1 Input and output types

```ts
/** Same shape as the existing GrayRaster, so escpos.ts helpers apply unchanged. */
type GrayPage = { width: number; height: number; gray: Uint8Array };

type NormRect = { x: number; y: number; w: number; h: number };   // fractions of the full page

type Section = {
  id: string;
  kind: 'leaf' | 'group';        // group = an internal XY-cut node, used to step outward
  parentId: string | null;
  depth: number;
  rect: NormRect;                // tightened, fractions of the FULL rendered page
  confidence: number;            // 0.1 … 0.99
  inkRatio: number;
  hasCodeLike: boolean;          // a barcode / QR / DataMatrix block is inside
  boundedBy: { top: EdgeKind; right: EdgeKind; bottom: EdgeKind; left: EdgeKind };
  order: number;                 // (y, x) reading order among leaves
};

type EdgeKind = 'page' | 'content' | 'dashed' | 'solid' | 'band' | 'gutter' | 'ink-gap' | 'none';

type DetectResult = {
  sections: Section[];           // flat, leaves and groups, ordered by (y, x)
  dropped: { rect: NormRect; reason: DropReason }[];
  contentRect: NormRect;         // ink bbox of the whole page
  analysis: { w: number; h: number };  // size of the buffer the analysis ran on
  ms: number;
  suggestedId: string | null;
};

type DropReason = 'below-min-area' | 'below-min-ink' | 'over-cap' | 'depth-cap' | 'code-block';

function detectSections(page: GrayPage, opts?: Partial<DetectOptions>): DetectResult;
function growRegionAt(page: GrayPage, at: { x: number; y: number }, opts?: Partial<DetectOptions>): Section | null;
```

Everything downstream consumes `Section`, so a **grown** section and a **detected** section are interchangeable.

### 2.2 Pipeline

1. **Analysis buffer.** `downsampleGrayToSize` (existing) to a long edge of `ANALYSIS_LONG_EDGE = 1000 px` — about 100 DPI on A4, 120 DPI on 4×6. This is the sampling grid, deliberately the one absolute number in the system; every other threshold is a fraction of it.
2. **Binarize.** Percentile threshold copied from `findLabelCropNorm`: sample ≤ 4096 pixels, take p90, `inkMax = clamp(p90 - 12, 40, 236)`. Then build an **integral image** of ink counts (one `Int32Array`, `(w+1)*(h+1)`). Every later clearance / ink-ratio / bbox query becomes O(1). This is what makes the whole thing fast enough to stay in JS.
3. **Trim to ink.** Global ink bbox + a 2 px pad → `contentRect`. All further work happens inside it, which is what removes the blank lower half of sample A.
4. **Dash merge.** Two closings, each **along the line's own direction only**:
   - `closedH`: per row, close horizontal gaps ≤ `DASH_GAP_X`.
   - `closedV`: per column, close vertical gaps ≤ `DASH_GAP_Y`.
   Closing along the line direction turns a dashed rule into one continuous thin line. It also smears text horizontally — handled by the thickness and clearance tests below, not by a smaller gap.
5. **Rule / band / gutter candidates.**
   - *Horizontal:* row profile over `closedH`. A candidate is a maximal run of consecutive rows whose coverage ≥ `RULE_COVER` of the content width. Its thickness `t` classifies it: `t ≤ THIN_T` → rule; `THIN_T < t ≤ BAND_T_MAX` → filled band; `t > BAND_T_MAX` → **content, not a separator** (this is how the Valmo black banner stays content).
   - *Vertical:* the same over `closedV` column profile.
   - *Gutters:* a maximal run of rows/cols with ink ratio ≤ `GUTTER_INK` and thickness ≥ `GUTTER_MIN`, cut at its centre. High confidence, no clearance test needed.
6. **Accept / reject each candidate** (this is where the false-positive traps are handled):
   - **span** — the merged run must cover ≥ `RULE_SPAN` of the content dimension.
   - **clearance** — a band of `CLEAR` thickness immediately on each side with ink ratio ≤ `CLEAR_INK`. Count clear sides: 2 / 1 / 0.
   - **distinct** — dashed (≥ `DASH_MIN_RUNS` gaps *before* closing), or thickness ≥ `THICK_MULT` × the median candidate thickness on this page, or classified as a filled band.
   - **Accept** if `clearSides === 2`, or (`clearSides ≥ 1` **and** `distinct`). **Reject** if `clearSides === 0` and not distinct → that is a table rule with text on both sides (trap 2).
   - **Code guard (trap 1).** Count x-transitions per scan line **before** closing. A rule has ~1-2 (a dashed rule has a regular, countable number); a barcode has many. Any candidate whose transition density exceeds `CODE_TRANS` is rejected as `'code-block'` and the enclosing region gets `hasCodeLike = true`. A barcode therefore can never split a region, and it positively identifies the label for the default suggestion.
   - **Min-area (trap 2, second half).** Both regions a cut would create must be ≥ `MIN_AREA` of the page area. This is also what keeps the black banner in sample C attached to the label: the banner would create a sliver region, so the cut is refused.
7. **Recursive XY-cut.** At each node, collect accepted cuts that lie fully inside and span it; score each `span × clearanceScore × distinctScore × balanceScore` (balance favours cuts that leave two substantial parts); take the single best; split; recurse. Stop on: no accepted cut, area < `MIN_AREA`, ink < `MIN_INK`, `depth ≥ MAX_DEPTH`, or `MAX_REGIONS` reached. Internal nodes are kept in the output as `kind: 'group'` — that is what Addendum item 2's step-outward needs.
8. **Tighten.** Each leaf shrinks to its own ink bbox (binary search on the integral image) + `PAD`. This is what turns Flipkart's full-width top half into the narrow centred bordered box.
9. **Drop.** Leaves below `MIN_AREA` or `MIN_INK` go to `dropped[]` with a reason; everything over the visible cap is dropped as `'over-cap'` but **kept in memory** so hit-testing can still resolve a tap onto it.
10. **Confidence.** Weighted mix of: the quality of the cut that bounded it (0.40), how many of its four edges are a page/content edge or an accepted separator or a clean ink gap (0.30), its ink ratio sitting in a sane band (0.20), `hasCodeLike` (0.10). Clamped to 0.1…0.99.
11. **Order and suggest.** Sort leaves by (y, x). Suggested = first of: contains a code-like block → largest area → closest to top-left.

### 2.3 Parameters — all relative to page size

`AW`, `AH` = analysis content width/height in px. `PAGE_MIN = min(AW, AH)`, `PAGE_MAX = max(AW, AH)`.

| Name | Value | Relative to | Why |
|---|---|---|---|
| `ANALYSIS_LONG_EDGE` | 1000 px | — | the sampling grid; ≈100 DPI on A4 |
| `INK_PCTL` / `INK_MARGIN` | p90 − 12, clamp [40, 236] | tone | reuses `findLabelCropNorm` |
| `DASH_GAP_X` | 0.012 × AW | content width | ≈2.5 mm on A4 — bridges dashes, not words |
| `DASH_GAP_Y` | 0.012 × AH | content height | |
| `RULE_COVER` | 0.55 | the scan line | coverage after closing to count a row as rule-ish |
| `RULE_SPAN` | 0.80 | content dimension | "spans most of the page dimension" |
| `THIN_T` | 0.006 × AH | content height | ≈1.8 mm — thin rule |
| `BAND_T_MAX` | 0.060 × AH | content height | ≈18 mm — above this it is content |
| `THICK_MULT` | 2.5 × median | candidate thickness | "much thicker" |
| `CLEAR` | 0.020 × AH (h) / AW (v) | content dimension | clearance band thickness |
| `CLEAR_INK` | 0.02 | clearance band pixels | "blank" |
| `GUTTER_MIN` | 0.040 × AH / AW | content dimension | min whitespace gutter to cut on |
| `GUTTER_INK` | 0.005 | gutter pixels | |
| `DASH_MIN_RUNS` | 6 | — | gaps before closing → dashed |
| `CODE_TRANS` | 18 per scan line | — | barcode / QR guard |
| `MIN_AREA` | 0.015 | page area | min region |
| `MIN_INK` | 0.002 | region pixels | drops specks |
| `PAD` | 0.004 × PAGE_MAX | page | tighten pad |
| `MAX_DEPTH` | 4 | — | |
| `MAX_REGIONS` | 24 internal | — | hard cap |
| `VISIBLE_CAP` | 8 | — | shown overlays (see §5) |
| `MATCH_IOU` | 0.55 | — | per-page matching (§4.1) |
| `SKEW_RANGE` | ±3° in 0.5° steps | — | Phase 4 |

Grow-specific (§2.4): `CELL = 0.006 × PAGE_MIN`, `CELL_INK = 0.02`, `DILATE = 1 cell`, `SEED_R = 0.010 × PAGE_MIN`, `GROW_MIN = 0.004` of page area, `GROW_MAX = 0.60` of page area.

### 2.4 Region grow — `growRegionAt`

This is the general fallback and the thing that makes tap-to-select work on any PDF (Addendum item 3).

1. Runs on the **same** analysis buffer and the **same** integral image as the detector — nothing is re-decoded, so it works the instant the buffer exists, long before full detection finishes.
2. If the tapped pixel is background, spiral out to `SEED_R` for the nearest ink pixel. None → return `null` → UI says "Nothing to select there".
3. **Cell grid, not per-pixel flood fill.** Divide the buffer into cells of `CELL` (≈1.5 mm). A cell is *on* if its ink ratio ≥ `CELL_INK` (one integral-image lookup). 8-connected flood fill over *on* cells from the seed cell, with a dilation of `DILATE = 1` cell. That merges a text block's words and lines into one blob while a gap wider than one cell (~3 mm) still separates blocks — and the gap is defined relative to page size, as required. A 1000×1400 buffer gives ~22k cells, so the fill is a few milliseconds.
4. **Not selecting the whole page** (the large-table / background case). Cap growth: if the blob exceeds `GROW_MAX` of the page area **or** touches 3+ content edges, abort and retry with `DILATE = 0` and `CELL_INK = 0.06`. If it still blows up, return the smallest **detected** section that contains the tap if one exists, else `contentRect`, with `confidence: 0.2`. Inside a dense invoice table every cell is on, so both passes blow up and we honestly fall back to the table region — and §5 tells the user that is what happened.
5. **Min / max size.** Blob area < `GROW_MIN` → expand one dilation step and retry, up to 3 times; still below → return it anyway flagged `tooSmall` so the UI can say "that is a very small block — drag the window to adjust". Never return a zero-size rect. Blob area > `GROW_MAX` → handled by step 4.
6. Return the blob's ink bbox + `PAD` — the same tighten the detector uses, so the result is indistinguishable from a detected section downstream.

### 2.5 Pixel source, threading, performance

**Pixel source.** `rasterPdfPageCached(uri, page, SMART_CROP_DPI = 100)` → `FileSystem.readAsStringAsync(uri, { encoding: Base64 })` → `pngBase64ToGray` (existing, `escpos.ts:271`) → `downsampleGrayToSize`. A distinct DPI key means the 150/225/300 preview cache entries are untouched; we add one small render per page (A4 at 100 DPI ≈ 827×1169, PNG ≈ 100-200 KB).

Two alternatives, both rejected for Phase 1:

- **Skia `readPixels`.** The viewer's `useImage` holds an `SkImage` of the *preview* render at 150-300 DPI. `readPixels` would hand us a ~2000×2800 RGBA buffer (≈22 MB) to grayscale and downscale in JS — strictly more work than asking the native module for a 100 DPI PNG and decoding that. Rejected.
- **A new native grayscale method** (`renderPdfPageGray` returning base64 raw bytes). Faster — skips the PNG encode and decode entirely — but needs new Kotlin **and** Swift plus a dev-client **rebuild**. Kept as the documented escape hatch in Phase 5 if measured time exceeds budget.

**Threading.** JS thread, main runtime. Reanimated worklets are not an option (no file I/O, no PNG decode on the UI runtime). `react-native-worklets@0.5.1` is installed and could host the detector on a separate runtime later — Phase 5 option, not Phase 1. To keep the UI responsive:

- the current page is detected first, kicked off behind `InteractionManager.runAfterInteractions`;
- the remaining pages are detected one per tick, with `await new Promise(r => setTimeout(r, 0))` yields between the decode, the binarize and the cut phases;
- a cancel token is checked at each yield and tripped on page change, tool close and screen unmount;
- results are memoised per `(uri, pageIndex)` in a module-level `Map`, cleared alongside `clearRasterCache()`.

**Expected cost per page** (to be confirmed on device, not asserted here): PNG decode + grayscale ≈ 40-90 ms, downscale ≈ 10 ms, binarize + integral image ≈ 15 ms, profiles + cuts + tighten ≈ 20-40 ms. **Budget: 150 ms per page** on a low-end Android. A 30-page PDF therefore costs ~4.5 s of background work spread across ticks, with the current page ready in well under 250 ms. If measurement exceeds the budget, Phase 5 takes the native path.

---

## 3. Why this is not OCR

Settled, not reopened. Finding sections is layout detection on pixels. No OCR in any phase. Phase 7 (naming sections) may later use text, and §1.7 says what is actually available if it does.

---

## 4. Data model changes and the three conflicts

### 4.1 Conflict 1 — one shared crop rectangle vs varying layouts

**Resolution: add per-page rects alongside the existing single rect. Do not replace it.**

```ts
type PdfEditSession = {
  // …unchanged…
  crop: PdfCrop | null;                                   // unchanged; manual crop still writes only this
  cropByPage?: ({ originNorm; sizeNorm } | null)[];       // NEW, smart crop only
  smartCropReview?: number[];                             // NEW, page indices with no confident match
};
```

Read precedence, in one new helper `cropRectForPage(session, i)`:

```
cropByPage?.[i]  ??  (crop && resolveScopeIndices(crop.scope, …).includes(i) ? crop : null)
```

- `src/lib/pdf-editor/export.ts:292-308` and `src/lib/pdf-editor/print.ts` switch to that helper. **Manual crop behaviour stays byte-identical** because manual crop never writes `cropByPage`.
- `cropWindowPts`, `cropRgbaNorm`, `sharpness0CropBoxesEqual` are untouched.

**Matching for other pages in scope.** Detection runs on every page in scope in the background. The user taps a section on the current page; for each other page:

1. score every detected leaf by **IoU** against the chosen normalized rect; accept the best if IoU ≥ `MATCH_IOU` (0.55);
2. else try **position rank** — the leaf at the same index in the (y, x) order — and accept only if IoU ≥ 0.25;
3. else the page goes into `smartCropReview` and gets **no rect at all**. Never guessed.

Pages in `smartCropReview` are surfaced in the crop panel ("4 pages need a look") with next/previous navigation, and they export with no crop until the user visits them.

### 4.2 Conflict 2 — fixed-size window at the output size

**Largely a non-issue: the code already resizes** (§1.3). What remains is the output size.

**Resolution.** Tapping a region:
- sets `draftCrop` to the region's rect;
- sets `outputSize` to `{ kind: 'custom', widthMm, heightMm }` from the region's real size — `ptToMm(rect.w * pageWpt)` × `ptToMm(rect.h * pageHpt)`, using `rasterPt` for the page size. `sizeFromMm` in `pdf-output-size-row.tsx` already yields `kind: 'custom'` unless it happens to land on a preset;
- turns "Match label shape" **off** if it was on, with a one-line notice — leaving it on would silently shrink the detected region;
- applies no page-level scaling. The window still pans and resizes afterwards.

**When other pages' matched regions differ in size — choose one, explicitly: each page keeps its own rect; the output size comes from the page the user tapped.** `OutputSize` is one value for the document and the printer needs one physical label size, so per-page sizes are not on the table. `containInBox` in `export.ts` already letterboxes a differently-sized rect into the label page, so nothing is cropped away. We **warn once**, listing the pages, if any matched rect's aspect differs by > 8% or its mm size by > 10% from the chosen one.

The alternative — keep the first chosen size and position that window on each page's region — is **rejected**: when a page's region is larger than the window it silently cuts content off a shipping label, which is the one failure the user cannot see before printing.

### 4.3 Conflict 3 — the normalization frame

**Correct the premise first.** Crop rects are **not** normalized to the unrotated MediaBox. `cropRgbaNorm` (`export.ts:220`) takes fractions of the **rendered bitmap**, and `src/app/pdf.tsx:112` keeps `rasterPt` (the renderer's own `widthPt`/`heightPt`) and prefers it over `session.pageSizesPt` for exactly that reason. Detection runs on a downscale of that same bitmap, so **detected rects need no remapping** for the page's own `/Rotate`.

Two real things still need handling in Phase 4:

1. **User rotation is applied after crop.** `export.ts:310` does `rotateRgba(cropped, …, rotationByPage[i])`, and the viewer draws the page unrotated while `cropEnabled`. So a detected rect must **not** be pre-rotated, and tap coordinates, detection coordinates and the stored rect are all in one frame. Phase 4 adds tests that assert this for a page with `rotationByPage[i] ∈ {90, 180, 270}`.
2. **`pageSizesPt` vs the renderer can disagree.** `pdf-lib`'s `page.getSize()` returns the MediaBox and ignores `/Rotate`; Android `PdfRenderer` applies `/Rotate` when it reports `page.width/height`; iOS uses `bounds(for: .mediaBox)` and does not. For a `/Rotate 90` page the two can be swapped, which would make the mm readout and the legacy `cropWindowPts` path wrong. Phase 4 adds a guard that detects the swap, logs it, prefers `rasterPt`, and a 90/180/270 fixture that runs end to end through export.

---

## 5. UI

### 5.1 Where it lives

Inside the existing Crop tool — crop is already a `PdfToolId`, so no new top-level tool. The crop panel gains one row: `[ Smart Crop ]  [ ‹ Prev section ]  [ Next section › ]`.

### 5.2 Overlays

**Off by default** (answers Addendum Q4). Tap-to-select works without them, and a clean page is easier to read. Overlays appear, dim, when either Smart Crop is pressed or the first tap resolves onto a detected section. Each is a numbered badge plus a thin outline; badge opacity carries confidence, and the selected one shows a label ("Section 2 · 86%").

Visible cap: **8**. Beyond that, keep the 8 highest-confidence, log the rest as `'over-cap'` with their rects, and show "6 more small blocks hidden — tap one to select it". The full list stays in memory so a tap still resolves onto a hidden section.

### 5.3 Tap-to-select, nesting, multi-select

Covered in detail in **Revision 1** at the bottom of this document, which supersedes "tap an overlay to snap".

Merged box, for the record: union of the selected rects — `x = min(x)`, `y = min(y)`, `right = max(x+w)`, `bottom = max(y+h)` — then `clampCropNorm`. Recomputed from scratch on every add and remove, so removing a section shrinks the window back correctly.

### 5.4 Default suggestion

Highest-scoring section by: contains a code-like block → largest area → closest to top-left. Shown with a dashed outline and a "Suggested" badge. **Never applied until tapped.**

### 5.5 Confidence, nothing found, and the geometric limit

- Nothing found, or top confidence < 0.4: inline note "Couldn't find clear sections on this page — tap a block, or drag the window." Manual crop is fully available and unchanged. No modal, no blocking.
- Detection still running: region-grow already answers taps, so the tool is never dead. A small spinner sits on the Smart Crop button only.
- **Stated limit.** Detection is geometric, so two blocks with no visual separation come out as **one** section. When a selected section covers more than 0.45 of the content area we show "This looks like one big block — drag the window edges to trim it." It reads as information, not a failure, and the user adjusts manually.

### 5.6 Accessibility

Prev/Next section buttons walk the ordered leaf list (answers Addendum Q5). Every overlay carries `accessibilityRole="button"` and `accessibilityLabel="Section 2, 48 by 102 millimetres, 86 percent confident"`.

---

## 6. Test plan

New dir `src/lib/pdf-editor/smart-crop/__tests__/`, plain `node:assert`, new scripts:

```json
"test:smart-crop": "npx --yes tsx --tsconfig tsconfig.json --test src/lib/pdf-editor/smart-crop/__tests__/*.test.ts",
"test:pdf-editor": "npx --yes tsx --tsconfig tsconfig.json --test src/lib/pdf-editor/__tests__/*.test.ts"
```

### 6.1 Synthetic buffers (one test each, built by a local `makeGray()` helper; reuse `createSyntheticLabelImage` from `src/printing/contour-detection.ts` where it fits)

| Fixture | Must produce |
|---|---|
| `dashed-v` | 2 sections, cut at the dashed line |
| `dashed-h` | 2 sections |
| `solid-thick-h` | 2 sections |
| `filled-band-h` | 2 sections, boundary at the band |
| `gutter-only` | 2 sections, cut at the gutter centre |
| `no-separator` | **1** section |
| `grid-2x2` | 4 sections |
| `blank-margin` | 1 section, tightened off the margin |
| `barcode-field` | **never splits**; `hasCodeLike === true` |
| `table-grid` (10 full-width rules, text both sides) | **1** section |
| `black-banner` (tall solid block at the top) | banner stays **inside** the label section |
| `noise-specks` | specks in `dropped[]` as `'below-min-ink'` |
| `skew-2deg` | same section count as the unskewed version |
| `rotated-90/180/270` | rects map back correctly (Phase 4) |

### 6.2 Redacted real fixtures

`fixtures/smart-crop/` holds `amazon-lr.png`, `flipkart-tb.png`, `valmo-tb.png` as **pre-rendered 100-DPI grayscale PNGs**, plus a `README.md` stating they are redacted, plus `expected.json` with the asserted boxes.

- The redacted **source PDFs are not committed**. Add to `.gitignore`:
  ```
  fixtures/smart-crop/*.pdf
  ```
- `scripts/make-smart-crop-fixture.ts` turns a local redacted PDF into the committed PNG, so the pipeline is reproducible without the PDF being in the repo.
- The user supplies the PDFs with all names, addresses, phone numbers and order details redacted. **An unredacted file is never committed.** Before the first commit of these fixtures, the images are visually checked for residual text.

**Expected results, asserted to ±0.02 normalized on each edge:**

- **A (amazon-lr):** 2 top-level sections — label on the left, invoice on the right, boundary at the dashed vertical line; the blank lower half is outside `contentRect`; the label has `hasCodeLike === true`.
- **B (flipkart-tb):** label = the bordered box, **narrower than the page** — assert `rect.w ≤ 0.80` and horizontally centred within ±0.03 — plus the invoice below.
- **C (valmo-tb):** ≥ 3 sections — label, product-details row, invoice. The label/invoice boundary within ±0.02 of the grey "TAX INVOICE" band's top edge. Label and details row must be **mergeable cleanly**: assert the vertical gap between them is ≤ 0.01, so their union has no dead strip. (This answers brief question 5 — see §9.)

### 6.3 Hit-test, grow, mapping

- **Hit-test:** inside a section; exactly on its edge; outside every section; nested (barcode block inside the label → smallest first); repeat tap stepping outward to the parent then wrapping back.
- **Region-grow:** on a text block (that block only); on a barcode (the code block, not the page); inside a dense table (falls back to the enclosing section, `confidence ≈ 0.2`); on empty background (returns `null`); on an isolated block with no separators around it (that block).
- **Multi-select:** add, remove, union box, select-none.
- **Coordinate mapping:** pure `screenToAnalysis` / `analysisToNorm` at rotation 0/90/180/270 and zoom 1× / 2× / 4×.

---

## 7. Phases (each shippable alone)

**Phase 1 — Detector and tests.** `src/lib/pdf-editor/smart-crop/*` plus node tests and the two new npm scripts. No UI, no session change. Nothing user-visible moves. *Done when:* every §6.1 test passes and the three §6.2 fixtures hit their tolerances.

**Phase 2 — Tap-to-select + region-grow, current page only.** (Moved ahead of per-page matching by Revision 1.) Gesture composition, overlays, hit-test with nesting, region-grow, multi-select and union, output-size-to-Custom, default suggestion, confidence and fallback copy, Prev/Next buttons. Writes only the existing `crop` with `scope: 'this'`. *Done when:* on-device logs show tapped point → resolved section (detected or grown) → box, for all three sample PDFs.

**Phase 3 — Per-page matching for All pages / Range.** `cropByPage`, `smartCropReview`, `cropRectForPage` helper, IoU + rank matcher, size-mismatch warning, export and print read paths. *Done when:* a mixed-layout multi-page PDF crops per page and flags the pages it could not match.

**Phase 4 — Rotation and skew.** `/Rotate` vs MediaBox guard, 90/180/270 end-to-end fixture, coarse deskew over `SKEW_RANGE`.

**Phase 5 — Performance and background scheduling.** Cancel token, per-page scheduling, measured budgets, cache cleanup for the 100-DPI PNGs, and the native `renderPdfPageGray` escape hatch if the budget is missed. *A rebuild is required only if the native method is actually added.*

**Phase 6 — *(optional)* text-layer hint.** iOS PDFKit only, platform-gated, confidence bonus only, never a hard boundary.

**Phase 7 — *(later)* section naming.** Label vs invoice. Out of scope now (answers brief question 4).

---

## 8. Verification (for the later build)

The user tests on a physical device through Expo. **No emulator, no adb, no screenshot capture.** Each phase reports:

- real on-device logs: detected boxes per page, detection time per page, for each of the three test PDFs;
- from Phase 2 on: the tapped point, whether it resolved to a detected or a grown section, and that section's box;
- `npx tsc --noEmit` clean;
- full test output.

A claim of "works" without those is not accepted.

**Rebuild vs refresh:** Phases 1-4 and 6's JS side are **refresh only** (Metro reload). A **rebuild of the dev client** is needed only if Phase 5 adds the native `renderPdfPageGray` method, or if Phase 6 adds the iOS PDFKit text call.

---

## 9. Answers to the brief's questions

1. **Pixel source and performance.** §2.5. Source: existing `pdf-raster` at a new `SMART_CROP_DPI = 100`, decoded with the existing `pngBase64ToGray`. Budget 150 ms per page; current page first behind `InteractionManager`, the rest one per tick with yields, cancelled on page change / tool close / unmount.
2. **Thresholds.** §2.3 — a full table, every value a fraction of the analysed content width, height, area or short edge. The one absolute is `ANALYSIS_LONG_EDGE = 1000 px`, which is the sampling grid itself.
3. **Confidence and fallback.** §5.5. Nothing found or confidence < 0.4 → an inline note plus normal manual crop. Region-grow answers taps even while detection is still running, so the tool is never dead.
4. **Section naming** — out of scope, named as **Phase 7**.
5. **Sample C's product-details row.** Yes, it comes out as its own section: it is bounded above by the solid grid rule and below by the grey "TAX INVOICE" band, both of which pass the accept test, and it clears `MIN_AREA`. It merges cleanly with the label because the two are vertically adjacent with no gap — §6.2 asserts the gap between them is ≤ 0.01 so their union has no dead strip. If on the real fixture the rule above it fails the clearance test, the details row stays part of the label section, which is also an acceptable outcome; the test asserts the **union**, not the split, so both behaviours pass and neither surprises the user.

---

## 10. Risks

1. **PNG decode speed in JS on a low-end Android** is the main unknown. Mitigation: 100 DPI keeps the buffer small; Phase 5 has the native escape hatch.
2. **Gesture conflict** is the most likely device-level problem. `cropGesture` is `Gesture.Pan().minDistance(0)`, which claims every touch. Phase 2 must change the composition and verify on a real device that dragging the window and its edges is never stolen by the tap. See Revision 1 item 5.
3. **Valmo's grey band and its black banner are both bands.** Separation rests entirely on the `MIN_AREA` rule refusing a cut that leaves a sliver. If the real banner is tall enough to pass, the label splits in two — and multi-select merge is the designed answer, which §6.2 asserts.
4. **Skew beyond ±3°** destroys row/column profiles. Phase 4 deskews coarsely; beyond that, confidence drops and manual crop takes over. We do not try to rescue a badly skewed scan.
5. **Unbounded raster cache.** `raster.ts` never evicts, and we add a 100-DPI entry per page plus PNG files in `cacheDir`. Phase 5 adds cleanup.
6. **`pageSizesPt` vs renderer page size** for `/Rotate` pages (§4.3) is a latent bug that already exists; Smart Crop will expose it. Phase 4 guards and tests it.
7. **Fixture privacy.** Committed PNGs are checked visually before the first commit; source PDFs are gitignored.

---

## 11. Open questions

- **Q1.** `AGENTS.md` points at Expo docs v57.0.0 but `package.json` pins `expo ~54.0.37`. Which is authoritative? Nothing in this plan needs a new Expo API, but it must be settled before Phase 2 touches gesture or file-system code.
- **Q2.** The three sample PDFs, redacted, are needed to lock the §6.2 tolerances. Until they arrive the expected boxes are reasoned from the written descriptions, not measured.
- **Q3.** Is `VISIBLE_CAP = 8` right for a phone screen, or is 5-6 less cluttered?
- **Q4.** `smartCropReview` pages currently export with **no** crop. Should they instead fall back to the shared `crop` rect, or block export until visited?
- **Q5.** The size-mismatch warning (§4.2) — a one-time inline note, or a blocking confirm before export?
- **Q6.** Should Smart Crop results survive `resetSession()` on unmount? Today the whole session is dropped when leaving the screen, so re-entering re-detects everything. Caching per source URI would help a user who bounces in and out of the editor.
- **Q7.** `src/lib/pdf-editor/__tests__/session.test.ts` is run by no npm script today. Confirm adding `test:pdf-editor` is wanted.

---
---

# Revision 1: Tap-to-select

Appended per Addendum 1. **Where this section conflicts with anything above, this section wins.**

## R1.1 The feature

Tapping anywhere on the page selects the section under the finger — on any PDF, any layout, with or without the Smart Crop button. This **replaces** "tap an overlay to snap" from §5.3.

1. **Select, then apply.** A tap selects a section: it is highlighted and the crop window snaps to it. Selection is an outline plus a light tint, never a change to page content, and never an applied crop — Apply Crop still commits.
2. **Hit-testing.** A tap resolves to the section containing the point. Nested sections (a barcode block inside the label) resolve **smallest-containing first**; a repeat tap at the same spot steps **outward** to the parent `group`, then wraps back to the smallest. A one-line hint shows the first time: "Tap again to select the bigger block" (dismissal persisted).
3. **No detected section under the tap → region-grow, never nothing.** `growRegionAt` (§2.4) grows the connected block of ink around the point, merging nearby marks with a gap defined relative to page size, and returns its tightened bounds. It reuses the detector's own analysis buffer and integral image — nothing is re-decoded — and §2.4 steps 4 and 5 are what stop it selecting the whole page from a tap inside a large table or on background.
4. **Multi-select, no separate toggle.** Tapping an unselected section adds it and the window snaps to the union (§5.3). Tapping a selected section removes it. "Clear" deselects all. A chip above the panel shows "2 sections · Clear" whenever more than one is selected. No multi toggle is proposed, because selection only ever happens on a tap while pan, pinch and window-drag are separate gestures — **if device testing shows taps stealing drags, a toggle is added then, with the measurement as the justification.**
5. **Gesture conflicts — reusing the project's existing approach.** Reused pattern: **`src/components/editor/skia-canvas.tsx:517-553`** — `Gesture.Race(dragGesture, Gesture.Exclusive(doubleTapGesture, tapSelectGesture))` with the tap as `Gesture.Tap().maxDuration(300)`. Applied here: a tap is a short press (`.maxDuration(300)`, `.maxDistance(12)`) and composes with the existing `cropGesture` as **`Gesture.Exclusive(tap, cropGesture)`**, with the tap gated to points outside the crop box's `CROP_GRAB`/`CROP_SLOP` grab zones so dragging the window or an edge is never stolen. `cropGesture.minDistance(0)` claims every touch today and must change — this is risk 10.2 and the **exact final composition is reported from the device, not asserted here.** The page has no pinch-zoom in crop mode today; if one is added, `zoomable-edit-pad.tsx:294-297` (`Gesture.Exclusive(doubleTap, Gesture.Simultaneous(pinch, pan…))`) is the pattern to extend.
6. **While detection is running or after it failed.** Region-grow works immediately — it needs only the gray buffer and integral image (~60 ms), not the full cut pass. Detected overlays appear as a **dim hint** as soon as they exist and are never the only way to select.
7. **Persistence.** Selection is session state. Changing page keeps the chosen section's normalized rect as the reference for the "All pages" matching in §4.1; selecting something new replaces it.

## R1.2 Answers to the addendum's questions

1. **Is selection the window, or separate?** **Separate, and selection drives the window.** A tap sets the selection and snaps the window to it. The user can then nudge or resize the window freely; any `cropGesture` commit **clears the "selected section" highlight and the chip but keeps the rect**, and marks that rect `manual` so §4.1 matching uses it as the reference. This is the recommended option in the addendum and it is what we build.
2. **Tap point on a rotated or zoomed page.** One pure function, `screenToAnalysis`, in `smart-crop/map.ts`: screen px → subtract the stage origin → divide by `layout.dispW`/`dispH` → multiply by the analysis size. Because the viewer draws the page **unrotated** while `cropEnabled` (`contentTurn = 0`) and the user's rotation is applied **after** crop at export (§4.3), no rotation term enters the tap path at all — the inverse rotation is the identity in crop mode. Tests still cover 0/90/180/270 and zoom 1×/2×/4× (§6.3) to pin that invariant down, so it breaks loudly if someone later enables rotation in the crop view.
3. **Min and max size of a grown region.** `GROW_MIN = 0.004` of page area, `GROW_MAX = 0.60` of page area (§2.3). Below min: expand one dilation step, up to 3 retries; still below → return it flagged `tooSmall` with the note "that is a very small block — drag the window to adjust". Above max: retry with no dilation and a stricter cell threshold; still above → fall back to the enclosing detected section, else `contentRect`, at `confidence 0.2`. Never a zero-size rect, never a silent whole-page selection.
4. **Are "show all sections" overlays on by default?** **No** — off by default, since tapping now works without them. They appear, dim, when Smart Crop is pressed or when the first tap resolves onto a detected section (§5.2).
5. **Accessibility.** Prev/Next section buttons walk the ordered leaf list, so no precise tapping is needed; every overlay carries `accessibilityRole="button"` and a spoken label with its number, size in mm and confidence (§5.6).

## R1.3 Tests added by this revision

All listed in §6.3 — hit-test (inside / edge / outside / nested / repeat-tap stepping and wrapping), region-grow (text block, barcode, inside a table, empty background, isolated block), multi-select (add, remove, union, select-none), and coordinate mapping at 0/90/180/270 and several zoom levels.

## R1.4 Phase impact

"Tap-to-select with region-grow" moves into the **first UI phase, Phase 2**, immediately after the detector, so the feature is useful before per-page matching exists. Per-page matching becomes Phase 3 and everything after it shifts by one. The §7 phase list and the tracker at the top of this document are already written in the revised order.

---

## Revision log

*Newest last.*

1. **Revision 1 — Tap-to-select** (2026-10-16). Appended per Addendum 1. Changes from the original sections:
   - **Supersedes §5.3's "tap an overlay to snap"** with general tap-to-select anywhere on the page, backed by region-grow when no detected section is under the finger.
   - **Reorders the phases:** tap-to-select + region-grow becomes Phase 2 (was to follow per-page matching); per-page matching becomes Phase 3; rotation/skew Phase 4; performance Phase 5; text hint Phase 6; naming Phase 7. The tracker and §7 are written in the new order.
   - **Adds** `growRegionAt` (§2.4), the grow parameters in §2.3, `smart-crop/grow.ts`, `hit-test.ts` and `map.ts`, and the hit-test / grow / mapping tests in §6.3.
   - **Decides** that selection is separate from the crop window and drives it; that overlays are off by default; that there is no multi-select toggle unless device testing forces one.
   - **Names the reused gesture pattern:** `src/components/editor/skia-canvas.tsx:517-553`.
