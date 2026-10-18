# Smart Crop for the PDF Editor — Implementation Plan

Status: **plan only, nothing implemented.** Build phase by phase, stop after each phase.

> The three sample pages were described in the brief but no image files arrived with it.
> Layout facts below come from the written descriptions (A Amazon, B Flipkart, C Valmo/Meesho).
> Before Phase 1 ships, the real redacted PDFs are needed to lock the fixture tolerances.

---

## Phase tracker

- [x] **Phase 0** — Current-state report (this document, section 1)
- [ ] **Phase 1** — Detector + node tests (`src/lib/pdf-editor/smart-crop/`), no UI — *code and tests done (R2.10); waiting on on-device probe numbers to close*
- [ ] **Phase 2** — Tap-to-select + region-grow + multi-select on the current page — *built (Revision 3), node-tested; waiting on the phone test of gestures and overlays*
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

---
---

# Revision 2: Approval changes

Approved from Revision 1, with the changes below. **Where this section conflicts with anything above, this section wins.** Earlier sections are left as written.

## R2.1 Confirmed, kept as written

- The crop window already resizes freely (grab-zone bitmask). Smart Crop uses free-size windows.
- Crop fractions are measured on the rendered bitmap (`cropRgbaNorm`, `rasterPt` preferred over `pageSizesPt`), so detected rects need no remap.
- Each page keeps its own matched rect. The document's output size comes from the page the user tapped; differently sized regions are letterboxed with a warning (`containInBox`).
- The pixel buffer comes from the existing 100-DPI raster plus `pngBase64ToGray`. No new dependency and no native change in Phase 1.
- The text layer stays Phase 6 — iOS only, confidence bonus only.

## R2.2 Separator classification must reject ordinary text

Replaces the thin-rule and band tests in §2.2 step 6.

**Dashed** requires *thin* **and** *regular*. Counting gaps is not enough:

- thickness ≤ `thinT`;
- ≥ `dashMinRuns` ink runs along the line before closing;
- duty cycle `sum(dashes) / span` inside [`dashDutyMin`, `dashDutyMax`];
- **dash regularity** — the relative standard deviation of the dash+gap *period* **and** of the dash lengths are both ≤ `dashRegularity`.

A text line fails regularity: word lengths and spaces vary far more than a dash pattern.

**Solid rule** requires thickness ≤ `thinT` **and** `solidity ≥ bandSolidity`, where solidity is the **pre-closing** ink density across the candidate's full thickness. A thin text line has solidity ≈ 0.2-0.35 and is rejected.

**Ink band** requires `thinT < thickness ≤ bandTMax` **and** `solidity ≥ bandSolidity`. **A text line can never qualify as a band** — it fails solidity, and in most fonts it also fails `thinT` from below, so there are two independent defences.

Anything in the thin or band thickness range that passes neither test is rejected with reason `'text'`.

**New "must not split" fixtures** (§R2.7): a lone text line with blank space above and below; a centred heading; a footer line at the bottom of a block.

## R2.3 Tone-step band candidates (pale title bands)

A pale grey band such as Valmo's "TAX INVOICE" strip is **lighter than the ink threshold** (which is capped at 236), so it produces no ink at all and the ink-based candidate scan in §2.2 step 5 can never see it. A second, independent candidate generator is added:

- maximal runs of scan lines where all of:
  - `|lineMid − paperLevel| ≥ toneStep`,
  - `uniform ≥ toneUniformMin`,
  - raw ink coverage ≤ `toneBandInkMax`,
  - thickness in [`toneBandTMin`, `toneBandTMax`];
- plus a neighbour check: at least one of the two `clear`-thick neighbouring bands differs from the band by ≥ `toneStepNeighbour`.

Accepted candidates become separators of kind `'band'` with `distinct = true`.

**Correction to the instruction — the test uses the per-line MEDIAN gray, not the mean.** A pale band with dark text in it (Valmo's band carries the words "TAX INVOICE") has its *mean* dragged far out of range: a 242-grey band with 15% black text has a mean of ~206, which reads as neither paper nor band, and whose pixels then sit 36 levels away from that mean so a uniformity-about-the-mean test scores ~0. The **median** of the same line is 242, and uniformity about the median is ~0.85. Every tone test in the detector therefore uses the median of the scan line (`mid`), computed from a 256-bin histogram per line. `uniform` is the fraction of the line within ±`toneTol` of `mid`.

A text row on white paper has `mid = 255`, so `|mid − paperLevel| = 0` and it is never a tone candidate. That is the third independent defence against text.

**Fixture:** a synthetic light-grey band at gray 238-245 with dark text inside it must split. Confirmed on the real `valmo-tb` fixture once it exists.

## R2.4 Correction — the accept rule, and what `minArea` is relative to

Two corrections to Revision 1 that the change above forces into the open. Neither is decided silently.

**1. The accept rule is loosened to match the brief.** Revision 1 §2.2 step 6 said accept if `clearSides === 2`, or (`clearSides ≥ 1` **and** distinct). That is **stricter than the brief** and it would reject Valmo's title band, because the band has ink immediately above it (the product-details row) and immediately below it (the invoice), giving `clearSides === 0`. The brief's rule is:

> a separator only if it is visually distinct (dashed, much thicker, or a filled band) **or** has blank clearance on at least one side, **AND** each region it creates is at least a minimum fraction of the page area

So the implemented rule is:

```
accept  ⇔  (distinct OR clearSides ≥ 1)  AND  both regions ≥ minArea
distinct ⇔  dashed  OR  thickness ≥ thickMult × median candidate thickness  OR  band (ink or tone)
```

A table rule is thin, solid, the same thickness as its neighbours, and has text on both sides — not distinct, `clearSides === 0` — so it is still rejected, which is what the brief's last sentence demands. A table's *outermost* rule often does have blank on one side and will split the table away from the block above it; that is a real visual boundary, and `minArea` plus `maxDepth` bound the damage.

**2. `minArea` is relative to the CONTENT rect, not the full page.** Revision 1 said "fraction of the page area". On sample A the content is the top half of the sheet, so a page-area reference would make every real section look half as big as it is, and on a page holding one small label with a wide blank margin it would drop everything. Area, ink and thickness thresholds are all measured against the **trimmed content rect**; only the returned `rect` values are fractions of the full page.

## R2.5 Phase 2 changes — recorded now, built later

**Taps inside the crop window.** A stationary tap **inside** the current crop window must select the section under it; only a drag moves or resizes the window. This **replaces** Revision 1 item R1.1.5's "gate the tap to points outside the grab zones", which is withdrawn — it made the window a dead zone, which is exactly where the user tends to tap.

Final composition to build:

```ts
// pdf-page-viewer.tsx
const cropGesture = Gesture.Pan().minDistance(CROP_DRAG_MIN)   // was .minDistance(0); 8–10 px
const tapSelect  = Gesture.Tap().maxDuration(300).maxDistance(CROP_DRAG_MIN)
const stage      = Gesture.Exclusive(tapSelect, cropGesture)
```

`CROP_DRAG_MIN = 9` screen px, sitting between the two: a touch that moves less than that resolves as a tap no matter where it lands, and a touch that moves more becomes a pan and the tap never fires. `Gesture.Exclusive` puts the tap first so it wins the ambiguous case. The grab-zone bitmask in `onBegin` is unchanged — it still decides *what* a drag moves — and `CROP_MIN`, `CROP_GRAB`, `CROP_SLOP` are unchanged. The reused pattern is still `src/components/editor/skia-canvas.tsx:517-553`. The exact value of `CROP_DRAG_MIN` is confirmed on a real device, not asserted here.

**The analysis buffer is built when the crop tool opens**, not when Smart Crop is pressed. `openCrop()` kicks off the 100-DPI render, decode and downscale for the current page immediately, so a tap almost always has a buffer waiting. A tap arriving before the buffer exists shows a brief busy state on the selection overlay and is then served when the buffer lands — **never a dead tap**, and never a silently ignored one.

## R2.6 Phase 1 additions

- **Dev-only probe.** Phase 1 ends with a `__DEV__`-guarded call that runs `detectSections` on the current page of the open PDF and logs the section boxes plus the time split — render, decode, downscale, detect — as real on-device numbers. No UI. Implemented as `src/lib/pdf-editor/smart-crop/dev-probe.ts` plus one small effect in `src/app/pdf.tsx`, so the detector itself stays free of React and React Native imports.
- **npm scripts** `test:smart-crop` and `test:pdf-editor`.

## R2.7 Fixtures

The real redacted PDFs are not ready. Phase 1 is built and verified against the synthetic fixtures.

**The three real-fixture tolerances are PROVISIONAL** and are locked once the user gives the folder path:

| Fixture | Status | Expected |
|---|---|---|
| `amazon-lr` | **PROVISIONAL** | 2 sections — left label, right invoice; label `hasCodeLike` |
| `flipkart-tb` | **PROVISIONAL** | bordered label box `w ≤ 0.80`, centred ±0.03, plus the invoice |
| `valmo-tb` | **PROVISIONAL** | ≥ 3 sections; label/invoice boundary at the title band; label and details row merge with a gap ≤ 0.01 |

Rules, unchanged from §6.2 and tightened here:

- **No PDF is ever committed.** `.gitignore` carries `fixtures/smart-crop/*.pdf`.
- Committed fixtures are **pre-rendered 100-DPI grayscale PNGs**, visually checked for residual text before the first commit.
- **Redaction replaces text with same-length placeholders** so block shapes and spacing are preserved, and **barcodes and QR codes are swapped for dummy codes of the same size**. This matters to the detector: shortening a redacted line would change the dash-gap and coverage statistics the classifier reads, and blanking a barcode would remove the `hasCodeLike` signal that drives the default suggestion.
- The committed PNG is produced by the **dev probe itself**, which writes the exact 100-DPI grayscale buffer the detector sees and logs its path. There is no node-side PDF renderer in this project (`pdf-lib` cannot rasterize and nothing else in `devDependencies` can), so generating the fixture on device through the real pipeline is both the only option and the more faithful one.
- The real-fixture test **skips with a clear message** while the PNGs are absent, so the suite is green and honest rather than failing on missing data.

**One synthetic expectation changed.** Revision 1 §6.1 expected the `noise-specks` fixture to put specks in `dropped[]` as `'below-min-ink'`. It does not, and should not: a cut that would isolate a speck is already refused because the speck side falls below `minArea`, so no speck ever becomes a section to drop. Specks are instead removed by a **robust content trim** — a row or column must carry at least `edgeInkMin` ink pixels to count as content, so a 1-3 pixel speck never stretches the content rect or a tightened leaf. The fixture asserts the section count and the content rect instead of a `dropped` entry.

## R2.8 Open questions — answered

- **Q1** `package.json` is authoritative (Expo ~54). `AGENTS.md`'s v57 pointer is ignored.
- **Q2** Real PDFs come later; see R2.7.
- **Q3** `VISIBLE_CAP` stays 8, tuned after device testing.
- **Q4** Pages with no confident match **must not export silently uncropped**. Before export, a confirm lists those pages with **Review** and **Export those uncropped**. (Phase 3.)
- **Q5** The size-mismatch warning is an inline note, also listed in that same confirm. No separate blocking dialog. (Phase 3.)
- **Q6** Deferred.
- **Q7** Yes — `test:pdf-editor` is added.

## R2.9 Parameters added by this revision

| Name | Value | Relative to | Why |
|---|---|---|---|
| `bandSolidity` | 0.72 | band pixels | pre-closing ink density; rejects text lines |
| `dashDutyMin` / `dashDutyMax` | 0.25 / 0.90 | dash span | a dashed rule's ink duty cycle |
| `dashRegularity` | 0.45 | rel. std dev | max variation of the dash+gap period **and** of dash lengths |
| `toneStep` | 8 | gray levels | min \|lineMid − paperLevel\| for a tone band |
| `toneStepNeighbour` | 5 | gray levels | min difference from at least one neighbouring band |
| `toneTol` | 14 | gray levels | uniformity window about the line median |
| `toneUniformMin` | 0.70 | line pixels | fraction within `toneTol` of the median |
| `toneBandInkMax` | 0.35 | line pixels | max raw ink inside a tone band |
| `toneBandTMin` / `toneBandTMax` | 0.008 / 0.060 × cross | content dimension | tone band thickness range |
| `paperPctl` | 0.95 | sampled pixels | paper level estimate |
| `edgeInkMin` | max(2, 0.002 × extent) | scan extent | robust content trim; kills specks |
| `visibleCap` | 8 | — | unchanged (Q3) |
| `CROP_DRAG_MIN` | 9 screen px | — | Phase 2 tap/drag threshold (R2.5) |


## R2.10 Found while building Phase 1

Building and testing Phase 1 showed problems in the R2.2-R2.9 design. Each one is listed here; none was changed silently. Where this subsection conflicts with R2.1-R2.9, **this subsection wins.**

**1. Barcode detection is now local, on a tile grid** (`codes.ts`). Neither the per-scan-line transition *count* (Revision 1) nor transition *density* can tell text from a barcode at 100 DPI, because a full-width line of 10 pt text has *more* transitions than a barcode. A whole-line profile also cannot see a barcode that shares its rows with text, which is exactly how Valmo prints it. The new test splits the page into tiles of `codeTile` (× unit). A tile counts as code when it is **dense along one axis and nearly constant along the other**: bars repeat identically for the height of the code, while text rows change shape. Both orientations are checked, so a barcode on a label turned sideways is still found. A region has `hasCodeLike` when it contains at least `codeTilesMin` code tiles. A separator candidate is rejected as `'code'` when code tiles cover at least `codeCover` of it.
   - **Stated gap:** QR and DataMatrix are *not* flagged as codes yet. They are constant only within one module row. They are still never split (tested); only the `hasCodeLike` signal and the suggestion bonus are missing for them.

**2. Printed-mark thresholds are relative to the PAGE, not the content.** This **corrects R2.4**, which said thickness thresholds were relative to the content rect. On the Amazon shape the content is half a sheet, so `dashGap` shrank to 6 px — below the real 7 px dash gap — and the dashed divider never closed into a line. A dash gap, a rule's thickness, a clearance band and a gutter are physical print features. They do not shrink because half the paper is blank. The split is now:
   - dash gap, `thinT`, `bandTMax`, clearance, gutter, tone band thickness, pad, code tile: **× unit**, the page's long edge in analysis px. Using the long edge also keeps every threshold the same under rotation.
   - `minArea`: **× the content area**, unchanged from R2.4.
   - `ruleSpan`: × the node being cut. `sepMinLen`: × the content extent.

**3. `toneTol` 14 → 6.** The uniformity window has to stay narrower than `toneStep` (8). Otherwise the window around a pale band reaches paper white and any half-blank line scores as uniform.

**4. Four rules added**, each found by a failing fixture:

| Rule | Found by | What it does |
|---|---|---|
| `sepMinLen` (0.25 × content extent) | barcode-field | `ruleSpan` alone is relative to the node, and inside a 40 px node one barcode bar "spans" the whole node. Rules and bands now also need an absolute minimum length. |
| Refuse a cut whose side is blank or a solid fill | black-banner | A solid block (ink ≥ `bandSolidity`) is content belonging to its neighbour, never a section on its own, so the Valmo banner stays inside the label. A blank side is refused too, so margins don't become groups. |
| A gutter crossed end to end by a stroke is not a gutter | composite design | Whitespace inside a bordered box is crossed by the box's side borders, and on a wide box those borders can fall below `gutterInk`. Without this rule a box would be cut in half. |
| Peel dashed cut-lines off the content edge | amazon-like | Amazon prints a dashed line along the bottom. With only blank paper beyond it, it is stripped before cutting, so it ends up in neither section. Solid edge rules are kept, because on a bordered label they are the box itself. |

**5. `edgeInkMin` 2 → 4.** At 2, each row of a 2×2 speck counted as content.

**6. Valmo "merges cleanly", re-specified.** Revision 1 asserted "gap ≤ 0.01". On the Valmo-shaped fixture the measured gap between label and details row is **0.0100** — the 6 px separator rule plus its own whitespace — which sits exactly on that boundary. That number was my guess at what "merges cleanly" means. The intent is that **nothing is lost** when the two are merged, so the assertion is now: the same drawn separator bounds both sections, and the strip between them is no more than that separator (≤ the ±0.02 edge tolerance). I did not just loosen the number.

**7. Skew.** A 2° tilt still splits on whitespace gutters, both horizontally and vertically (tested). **A 2° tilt does hide a thin rule** from the row profile: the rule spreads across ~24 rows and no single row reaches `ruleCover`. This is a confirmed Phase 4 gap. It is pinned by a characterization test that asserts today's behaviour (1 section) and is expected to flip to 2 when Phase 4 adds deskew. The first version of the fixture helper sheared rows sideways, which leaves horizontal rules perfectly horizontal, so it could not have tested this; that is fixed.

**8. Two composite synthetics added**, `amazon-like` and `valmo-like`, as stand-ins for the PROVISIONAL real fixtures. Both pass:
   - amazon-like: label left (holds the barcode, suggested), invoice pieces right, bottom cut-line peeled.
   - valmo-like: 3 sections — label (banner and barcode inside, suggested), details row, invoice — with the cut at the pale band.

**9. Tests also assert *why* each trap is rejected** (`rules.test.ts`), not just the section count, so a text line rejected for the wrong reason would fail: text line → `'text'`, footer → `'text'`, barcode → `'code'`, tight table rules → `'no-clearance'`, pale band accepted with `clearSides 0` as a distinct band.

**10. `npx tsc --noEmit` is not clean on this repo, independent of this work.** Before Phase 1 there were 245 errors (mostly the separate `admin/` Next.js app, plus existing app errors). Phase 1 adds **zero**: there are no errors in `smart-crop/`, `src/lib/pdf-editor/` or `src/app/pdf.tsx`. Verification compares against that baseline rather than claiming a clean run.

### Parameters changed or added in R2.10

| Name | Value | Relative to | Note |
|---|---|---|---|
| `unit` | page long edge, px | — | reference for every printed-mark threshold |
| `dashGap`, `thinT`, `bandTMax`, `clear`, `gutterMin`, `toneBandTMin/Max`, `pad` | unchanged values | **× unit** (was × content) | item 2 |
| `toneTol` | **6** (was 14) | gray levels | item 3 |
| `sepMinLen` | 0.25 | content scan extent | item 4 |
| `edgeInkMin` | **4** (was 2) | px | item 5 |
| `codeTile` | 0.024 | × unit | item 1 |
| `codeTransDensity` | 0.10 | bar starts / tile px | item 1 — replaces `codeTrans` |
| `codeSteadyMax` | 0.06 | changes / ink px | item 1 |
| `codeInkMin` / `codeInkMax` | 0.15 / 0.85 | tile ink ratio | item 1 |
| `codeTilesMin` | 3 | tiles | item 1 |
| `codeCover` | 0.30 | candidate area | item 1 |

### What Phase 1 delivered

- `src/lib/pdf-editor/smart-crop/` — `types.ts`, `params.ts`, `gray.ts`, `profile.ts`, `codes.ts`, `rules.ts`, `detector.ts`, `index.ts`, `dev-probe.ts`.
- Tests — `__tests__/fixtures.ts`, `detector.test.ts`, `rules.test.ts`, `real-fixtures.test.ts`.
- Dev probe — a `__DEV__`-only effect in `src/app/pdf.tsx` that loads the probe with a dynamic `import()`. 800 ms after each page change it logs `[smart-crop]` boxes and the render / decode / downscale / detect split, and writes the 100-DPI grayscale PNG used to make fixtures.
- `test:smart-crop`, `test:pdf-editor` in `package.json`; `fixtures/smart-crop/README.md`; `fixtures/smart-crop/*.pdf` in `.gitignore`.
- **Phase 1 closes** when on-device probe logs for the three sample PDFs are in, and the PROVISIONAL tolerances are locked against the real PNGs.

---

# Revision 3: Phase 2 build

Phase 2 was started at the user's request before the Phase 1 device numbers came in, so **both phases now wait on one phone test**. Where this revision conflicts with anything above, **this revision wins.**

## R3.1 What was built

| Piece | File |
|---|---|
| Detector split into `prepareAnalysis` (cheap: threshold, integral image, code map) and `detectPrepared` (the cut), so region-grow can answer taps before detection finishes. `detectSections` keeps its old signature. | `smart-crop/detector.ts` |
| Screen ↔ page mapping with rotation, zoom and pan terms | `smart-crop/map.ts` |
| Hit chain: leaf under the point, then each enclosing group out to the root | `smart-crop/hit-test.ts` |
| Region-grow on a cell grid, reusing the prepared buffers | `smart-crop/grow.ts` |
| Tap resolver: detected leaf first, else grow | `smart-crop/resolve.ts` |
| Pure selection reducer: add, remove, repeat-tap step-outward with wrap, union, select-only | `smart-crop/selection.ts` |
| Shared 100-DPI page loader (the dev probe now uses it too) | `smart-crop/source.ts` |
| Screen hook: reads the page **when the crop tool opens**, queues early taps with a busy spinner, detects in the background, builds overlays and notices, logs taps in dev | `components/pdf-editor/use-smart-crop.ts` |
| Overlays and the tap-busy spinner | `components/pdf-editor/pdf-section-overlays.tsx` |
| Tap gesture, drag threshold, overlays, dimmed-not-hidden mask | `components/pdf-editor/pdf-page-viewer.tsx` |
| Smart Crop / Prev / Next row, selection chip with Clear, notice line, "Label size on Apply" | `components/pdf-editor/pdf-crop-tool.tsx` |
| Wiring: staged label size, Match-label-off notice, nudge clears highlight, Apply writes size then crop | `app/pdf.tsx` |
| Persisted one-time hint flag `smartCropHintSeen` | `stores/settings-store.ts` |

**Final gesture composition** (as R2.5 specified): `cropGesture` is `Pan().minDistance(CROP_DRAG_MIN = 9)`. The tap is `Tap().maxDuration(300).maxDistance(9)`, and the stage gesture is `Gesture.Exclusive(tap, cropGesture)`. The pan's grab-zone bitmask is unchanged. Two details made it safe:

- the pan commits only if it actually activated (`onStart` sets a flag), so a winning tap never counts as a nudge;
- the tap releases the pan's "active" flag before the window snaps, so the layout sync can't skip the update.

## R3.2 Decisions made while building — none silent

1. **The label size is staged, and applied on Apply Crop.** Writing the size on tap (§4.2 as worded) would change the document size before the crop is applied. Cancel would then leave a changed size behind, which breaks "never applied silently". The size from a selection is shown in the panel as **"Label size on Apply W × H mm"** and written together with the crop. It snaps to a preset within 0.15 mm, using the same rule as the size row.
2. **Clearing the selection drops the staged size; dragging the window keeps it.** Clear means "not this section", so its size should not stick. A nudge is a refinement of the selection the user chose (R1.2.1), so it keeps the size.
3. **The crop mask is dimmed instead of solid while Smart Crop is in use.** Commit `939ea33` changed the mask from `rgba(0,0,0,0.62)` to solid `#0A0A0A`, which hides the whole page outside the window. Tap-to-select needs that part of the page to be visible: the user can't add the invoice to a selection they can't see. The solid mask is kept as the default. A 62% dim (the old value) is used only while overlays are shown or something is selected. **This touches a deliberate design choice; to be confirmed on device.**
4. **The "touches 3+ content edges" grow cap from §2.4 step 4 is dropped**, and the area cap (`maxArea` 0.6) is kept. A label that fills the left half of a page with no bottom cut-line touches top, left and bottom — three edges — and would have been capped wrongly.
5. **Repeat tap and removal are separated by timing.** A second tap within 1.2 s and 8 screen px steps outward through the chain and wraps back to the smallest. A slower tap on a selected section removes it. That is the only way both R1.1.2 and R1.1.4 can hold for the same spot.
6. **Prev / Next replace the selection with one section.** They are the precise-tap-free path (R1.2.5); multi-select stays a tap gesture.
7. **Overlays turn on when a tap resolves onto a *detected* section**, or when Smart Crop is pressed (R1.2.4). Grown-only taps leave them off.
8. **With scope "All pages" or "Range", Phase 2 applies the selected rect to every page in scope.** That is the existing shared-rect behaviour. Per-page matching is Phase 3.
9. **The Smart Crop button uses the `viewfinder` icon.** `sparkles` has no Android mapping in `AppIcon`.
10. **Overlays are screen-reader buttons, but this is unverified on device.** They are `accessible` with a spoken label and an `activate` action, while `pointerEvents="none"` keeps them from taking touches. Whether TalkBack still focuses a `pointerEvents="none"` view is not confirmed. Prev/Next are the guaranteed accessible path.

## R3.3 Tests added

`select.test.ts`, 21 tests:
- **mapping:** plain scale; corner placement at 90/180/270; 36 round trips across 4 rotations × 3 zoom levels with pan; rotated rect size
- **hit-test:** inside, on the edge, outside
- **grow:** a text block; a barcode (with `hasCodeLike`); a half-page table → the table; a full-page table → `capped`, never silent; empty background → nothing; an isolated block; a speck → `too-small`; a grown block that is a detected section → that section
- **resolve:** a detected leaf wins; a tap before detection still grows
- **selection:** add, remove, union, select none; repeat tap steps outward and wraps; a slow repeat removes; Prev/Next; tapping nothing

The gesture composition, overlays, busy state and notices are UI. They are type- and lint-checked, but **only the phone test exercises them.**

## R3.4 Phase 2 closes when

On-device logs for each of the three sample PDFs show the tapped point, whether it resolved to a detected or a grown section, and that section's box (`[smart-crop] tap (x, y) → added detected #2 … · via detected`). In addition:
- a tap inside the window selects, and a drag of the window, an edge or a corner still moves or resizes it;
- the dimmed mask (R3.2.3) is accepted.

---

## Revision log (continued)

2. **Revision 2 — Approval changes** (2026-10-16). Plan approved; Phase 1 implemented, Phase 2 not started. Changes from the earlier sections:
   - **Tightens separator classification so ordinary text cannot be a separator** (R2.2): dashed now requires duty cycle and period/length regularity, not just a gap count; solid rules and ink bands now require a pre-closing solidity test. Three new "must not split" fixtures.
   - **Adds tone-step band candidates** (R2.3) so a pale grey title band lighter than the ink threshold is still found, and **corrects the instruction's "row mean" to the per-line median**, because dark text inside a pale band drags the mean out of range.
   - **Corrects Revision 1's accept rule** (R2.4) to `(distinct OR clearSides ≥ 1) AND minArea`, matching the brief. Revision 1's stricter rule would have rejected Valmo's title band, which has ink on both sides.
   - **Corrects the reference for `minArea`, `minInk` and thickness thresholds** from full-page area to the **trimmed content rect** (R2.4).
   - **Supersedes Revision 1 item R1.1.5's "gate taps outside the grab zones"** (R2.5): a stationary tap inside the crop window now selects; `cropGesture.minDistance(0)` becomes `CROP_DRAG_MIN ≈ 9 px` and the tap is first in `Gesture.Exclusive`. Phase 2.
   - **Moves analysis-buffer construction to crop-tool open** rather than Smart Crop press, with a busy state instead of a dead tap (R2.5). Phase 2.
   - **Adds the Phase 1 dev probe and the two npm scripts** (R2.6).
   - **Marks the three real-fixture tolerances PROVISIONAL**, fixes the redaction rules, and makes the dev probe the fixture generator since no node-side PDF renderer exists (R2.7).
   - **Changes the `noise-specks` expectation** from a `dropped[]` entry to a robust content trim (R2.7).
   - **Answers Q1-Q7** (R2.8) and adds the parameters in R2.9.
3. **Revision 2, R2.10 — Phase 1 build findings** (2026-10-16). Changes from R2.1-R2.9, all found by failing fixtures while building:
   - **Replaces the transition-count code guard with a local tile-grid code map** (density along one axis, constancy along the other). QR/DataMatrix are not flagged as codes yet; stated as a gap.
   - **Corrects R2.4:** printed-mark thresholds (dash gap, thickness, clearance, gutter, pad, tone band, code tile) are relative to the page long edge, not the content. `minArea` stays content-relative.
   - **Changes `toneTol` 14 → 6 and `edgeInkMin` 2 → 4.**
   - **Adds four rules:** separator minimum length; refuse cuts with a blank or solid-fill side; crossed gutters are not gutters; peel dashed cut-lines off the content edge.
   - **Re-specifies Valmo "merges cleanly"** from "gap ≤ 0.01" (measured 0.0100, on the boundary) to "the strip between them is only the separator".
   - **Confirms the thin-rule-under-skew Phase 4 gap** with a characterization test, and fixes the shear helper that could not tilt horizontal rules.
   - **Adds** the `amazon-like` and `valmo-like` composite synthetics and the rejection-reason tests.
   - **Records** the pre-existing 245-error `tsc` baseline; Phase 1 adds zero.
4. **Revision 3 — Phase 2 build** (2026-10-16). Phase 2 started at the user's request before the Phase 1 device numbers. Changes from earlier sections:
   - **Refines §4.2:** the label size from a selection is staged and applied with the crop on Apply, not written on tap. Clear drops the staged size; a nudge keeps it.
   - **Changes the crop mask while Smart Crop is in use** from solid to a 62% dim, so sections outside the window can be seen and tapped. The solid mask from commit `939ea33` stays the default.
   - **Drops the "touches 3+ content edges" grow cap from §2.4**; the area cap stays.
   - **Pins down R1.1.2 against R1.1.4:** a repeat within 1.2 s / 8 px steps outward; a slower tap removes.
   - **Splits the detector** into `prepareAnalysis` + `detectPrepared` so taps are served before detection ends; `detectSections` is unchanged for callers.
   - **Records** that All pages / Range still share one rect until Phase 3, and that overlay screen-reader access is unverified.

### Revision 4: Label size is never taken from a selection
- Supersedes the staged label size in R3 (and "label size on Apply"). Selecting or tapping a section only moves the crop window; the output label size stays what the user chose in the size step. The cropped part is fitted into that size at render (aspect preserved), so the panel always shows the chosen label size.
- Revision log: 5. Removed `draftOutput`/`pendingOutput` staging from `pdf.tsx` and `pdf-crop-tool.tsx`.

### Revision 5: Focus on the selection
- After a tap, Prev/Next or overlay activation selects something, the crop view zooms to the selected window (the normal zoomed crop view), so trimming is easy. Dragging the window keeps the focus.
- The Smart Crop button (or Clear) returns to the whole page with outlines, which is how a further section is added to a multi-selection.
- Revision log: 6. `focused` state in `use-smart-crop.ts`; `revealOutside` in `pdf.tsx` is off while focused.

### Revision 6: Smart Crop and Manual Crop buttons
- The crop panel opens with two buttons, each with a one-line description under its title: **Smart Crop** ("Finds sections for you. Tap one to select it.") and **Manual Crop** ("Drag the window and its edges yourself."). Smart is the default.
- Manual Crop clears any selection and turns off section outlines and tap-to-select, leaving the plain window. Smart Crop turns them back on. The old Smart Crop button is now "Show all sections", next to ‹ ›, and only appears in Smart mode.
- Revision log: 7. `cropKind` state in `pdf.tsx`; `kind`/`onKind` props on `PdfCropTool`.

### Revision 7: Smart and Manual are exclusive
- Supersedes the "drags still move the window" rule (R3 / R2 Phase 2) for Smart mode. In Smart Crop the window only changes by selecting a section (tap, ‹ ›, outline); dragging is off (`windowLocked`). In Manual Crop taps and outlines are off and only dragging works. Switching keeps the current window.
- A selection zooms the view to its window (R5). Apply keeps the user on the Edit page showing the cropped part; the header Next opens Print.
- Revision log: 8. `windowLocked` prop on `PdfPageViewer`; notices now point to Manual Crop for trimming.

### Revision 8: Adjustable selection, named sections, Done
- Supersedes R7's drag lock: in Smart Crop a selected section is shown zoomed with its borders draggable (move and resize), so the user can fine-tune it. Manual Crop still has no taps or outlines.
- Every outline now shows a name ("Section N", "Section N (barcode)"), not only the selected one. The panel button reads **Done** and returns to the Edit page showing the cropped page, where crop or other tools can be used again; the header Next opens Print.
- Edge accuracy on the user's real PDFs is unverified: no redacted samples or device logs yet. The synthetic bordered label snaps to within 2 px of its border.
- Revision log: 9. Removed `windowLocked`; `sectionName` in `use-smart-crop.ts`.

### Revision 9: Manual by default, tap crops
- The crop tool opens in **Manual Crop**. Choosing **Smart Crop** detects and outlines sections immediately.
- Tapping a section in Smart Crop applies the crop to it at once and closes the tool, so the Edit page stays open for watermark, rotate and the rest. Header Next opens Print. ‹ › only preview a section; **Done** applies it. Nested step-outward taps now need the crop tool reopened (the tap closes it).
- Manual Crop's **Done** applies the window. In both cases the Edit page now shows only the cropped portion (before, `fillPage` showed the whole page); the viewer fits it to the stage.
- Supersedes R5's "Smart Crop button returns to the whole page" only in that a tap no longer leaves the crop tool open.
- Revision log: 10. `cropKind` defaults to manual and resets on open; `onSmartSelection` applies on tap; `fillPage` off when cropped.

### Revision 10: Re-cropping treats the crop as the page
- Opening Crop on a page that already has a crop uses that cropped part as the whole page: the view shows only it (a PNG cut from the preview), the window and section outlines are fractions of it, and Smart Crop analyses only that region (`loadAnalysisGray(..., region)`; cache key includes the region). On Done or tap, the result is composed back into full-page fractions (`toFullPage`), so storage, export and printing are unchanged and the crop scope still applies.
- Remove drops the crop and returns the tool to the full page. Changing page inside the tool reopens it for that page's own crop.
- Revision log: 11. `cropBase`/`baseUri` in `pdf.tsx`; `region` option in `useSmartCrop` and `loadAnalysisGray`.

### Revision 11: Match label removed
- The "Match label" switch and its aspect-lock / snap logic are gone from the crop tool. The window is always free-form; the crop is fitted into the chosen label size at render. Supersedes the match-label notices in R3 and R7 text.
- Revision log: 12.

### Revision 12: Window starts on the whole page
- Manual Crop opens with the window covering the whole page (or the whole cropped part when re-cropping), not a label-shaped default that left a small section out. Remove resets to the same.
- Revision log: 13.

### Revision 13: Re-crop opens without a "No page" gap
- The cropped part used as the page for a re-crop is cut in the background as soon as a crop is applied and cached (`regionImageCached`, cleared with the raster cache). While it is not ready the viewer shows the spinner (`pending`), never "No page".
- Revision log: 14.

### Revision 14: Faster PDF import (outside Smart Crop)
- Import no longer reads and parses the whole file in JS. The native renderer gives page count and first-page size from an 8 DPI render; all pages are assumed that size until `loadPdfPageSizes` (the old pdf-lib read) fills in the exact sizes ~1.5 s after the editor opens. Export re-reads sizes from the file it parses anyway. Falls back to the full parse if the native call fails (also gives the encrypted-PDF message).
- Revision log: 15.
