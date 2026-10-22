# .sezlabel — complete data schema (PLAN ONLY, no code)

Status: DRAFT for approval. Nothing built. No existing file edited, no golden touched, no git state changed.
Evidence tags: **[src]** = from reading source. **[run]** = verified by running. **[proposal]** = my suggestion, not in code today. **[unverified]** = not checked, must be checked before build.

Path keys used in tables:
`T` = `src/components/editor/types.ts` · `LD` = `src/lib/label-document.ts` · `TC` = `src/lib/editor/table-cells.ts` · `SR` = `src/lib/serial/types.ts` · `BL` = `src/lib/bulk-labels.ts` · `LS` = `src/lib/label-settings.ts` · `MG` = `src/lib/media-geometry.ts` · `SP` = `src/components/editor/signature-preview.tsx` · `DS` = `src/stores/data-store.ts`

---

## 0. What M1 already covers

**Finding: no M1 code exists in this repo [src].** Branches are `dev`, `main`, `origin/dev`; the only stash is `auto-detect-offset`. A search for `fflate`, `manifest.json`, exporter/importer finds nothing in `src/`. What exists is the design doc `docs/sezlabel-share-format.md` (235 lines, header says "DRAFT… No code written"). I treat its **"Smallest first milestone — M1"** as the M1 scope:

- Export: `manifest.json` + `document.json` + `assets/` (images, user clipart) + `preview.png`. No fonts, no Excel.
- Import: manual "Open label file" via the document picker, full validation, preview + missing-items summary, "keep both" only, always a new label.
- `schemaVersion` + `minAppVersion` from day one; malicious-zip and round-trip suites.
- Not in M1: font bundling, Excel embedding, Replace, file association, printer-size block.
- Draft also fixes: zip container, limits table (§3), security rules, versioning rules, catalog-by-id, M2 Excel / M3 association / M4 fonts.

**This plan extends that draft (keeps its container, security, limits, milestones) and replaces its field inventory**, because the draft's tables are incomplete or wrong in places. Corrections found by reading source:

| # | Draft says | Source says |
|---|---|---|
| 1 | Tests are "jest" | Tests are `node:test` run with `tsx` (`package.json` scripts, e.g. `test:serial`). **[run]** `npx tsx --tsconfig tsconfig.json --test src/printing/raster/__tests__/paper-type-bitmap.test.ts` passed 1/1. |
| 2 | No incoming-file handler exists | `modules/share-target/` is an Android Kotlin module: `activity-alias` with a `SEND` intent filter for spreadsheet MIME types only, copies the file, emits `onSharedFile` (`modules/share-target/src/index.ts`, `AndroidManifest.xml`). Extend it; do not build a second one. iOS has none. |
| 3 | Element tables | Missing: `serial` (`SerialConfig`) on text/barcode/qrcode/arctext/degrees/table cells; image `imageMode/threshold/brightness/contrast/invert/fitLabelSource`; hidden `degreesOffset` on text. |
| 4 | Document-level objects | Missing: `serialBatch`, `upsTile`, `templateSvg`, `referenceImage`, `templatePreviewType`, `templateCategory`. |
| 5 | Migrations on import = borders only | Store also runs `migrateDocumentReferenceImage` (`label-store.ts:10-11`, `reference-image.ts`). |
| 6 | Step 3 "normalizeDocumentElements only if needed" | **Never run it on import.** It clamps every element to the label and deletes full-canvas white circle fills (`element-sizing.ts:691-709`). That changes the raster. |
| 7 | Settings NOT shared: `hOffsetMm/vOffsetMm/flipHorizontally/gapLengthMm` | Also stored on the label: `elementsOffsetXMm/YMm`, `borderOffsetXMm/YMm`, `printGrid`, `printGridSpacingMm`, `printRuler` (`LS`). |
| 8 | `parse-svg.ts` safety unreviewed | `sanitizeUserSvg` is a regex deny-list, 180 000 chars, blocks `<script`, `<foreignObject`, `<iframe`, `javascript:` only (`parse-svg.ts:220-226`). Too weak for untrusted files. |
| 9 | WebP unverified | User clipart accepts `.webp` (`user-storage.ts` `IMAGE_EXT`); the reference-image path refuses it. Image-element pipeline: not checked. |

---

## 1. Element menu: every entry and what it creates

Menu = `TOOL_ROWS` in `src/app/edit.tsx:313-340`, 18 entries, handled in `handleToolPress` (`edit.tsx:~4010`). **[src]**

| Menu entry | Creates | Stored as |
|---|---|---|
| Text | `text` | element |
| Barcode | `barcode` | element |
| QRCode | `qrcode` | element (also PDF417, DataMatrix via `encodeMode`) |
| Image | `image` (picker → ingest) | element; crop is **baked into a new file** (`apply-image-crop.ts`), no crop fields exist |
| Clipart | `clipart` | element |
| Line | `line` | element |
| Shapes | `shape` | element (rectangle, roundedRectangle, oval, circle) |
| Table | `table` (rows × cols picker, 1..10) | element |
| Time | `time` | element (live clock + offsets) |
| ArcText | `arctext` | element |
| Serial / Counter | `degrees` + `serial` config | element; not allowed on multi-up labels (`edit.tsx:4012`) |
| Excel | not an element: opens import, builds `bulk` | `LabelDocument.bulk` + `ImportedExcelFile` |
| Scan | `qrcode` / `barcode` / `text` (`edit.tsx:3585-3613`) | normal elements |
| OCR | `text` | normal element |
| Line Emoji | `clipart` (category `emoji`) | element |
| Label Clone | scan mode `labelClone`; output not traced **[unverified]** | likely a new document |
| Border | `border` | element (one per label) |
| Signature | `signature` | element |

**Templates (industry + admin):** no template-only element type exists. `instantiateTemplate` (`template-schema.ts`) copies `LabelElement[]` into a normal document and sets `templatePreviewType` / `templateCategory`. Admin sample content is limited to text/barcode/qrcode/line (`template-sample.ts`) and is turned into normal elements by `sampleToElements`. Admin SVG templates store the outline as `templateSvg.xml` on the document (`template.tsx:299`). So the schema needs **13 element types, no more**. Photo frames (`constants/photo-frames.ts`, `PhotoFrameDef` with slots) **[unverified]** whether they end up as ordinary image elements.

Element union: `ElementType` in `LD:135-148` = text, barcode, qrcode, line, shape, table, time, arctext, degrees, image, clipart, border, signature. **[src]**

### Layer order
Draw order is `sortLayers()` (`template-schema.ts:84-90`): `border` always first (bottom), then ascending `zIndex ?? 0`; ties keep array order (stable sort). Used by the rasterizer (`skia-rasterizer.ts:301,640`), canvas (`konva-canvas.tsx:506`) and preview. Reorder writes `zIndex` (`engine.ts:262-297`). **File rule [proposal]:** keep array order and `zIndex` exactly; do not renumber. **[src]**

---

## 2. Element tables

Columns: field | type | unit | default if missing | lives in. "default" = what the importer fills when the key is absent; it equals the `DEFAULT_*_STATE` value (the value a new element gets) unless noted. Whether the renderer has its own fallback for each optional field is **[unverified]** except where stated.
Import policy [proposal]: an element missing `left`, `top` or `width` (or `height` where it is required) is **skipped with a warning**; any other missing field takes its default.

### 2.0 Common fields (on every element)

| field | type | unit | default | lives in |
|---|---|---|---|---|
| id | string | – | regenerated on import | `LD:157-171` (`{id}` + state) |
| type | ElementType | – | required | `LD:135` |
| rotation | number | degrees | 0 | `T:Rotation`; `normalizeRotation` forces 0/90/180/270 |
| left | number | mm | required | per-type state in `T` / `LD` |
| top | number | mm | required | same |
| width | number | mm | required | same |
| height | number | mm | required except text/time/degrees (optional); line = thickness | same |
| lockMovement | boolean | – | false (border: true) | same |
| needPrinting | boolean | – | true | same |
| opacity | number | 0..1 | 1 | `LD:LayerMeta`; set by templates only; **no renderer use found [unverified]** |
| zIndex | integer | – | absent (treated 0) | `LD:LayerMeta` |
| visible | boolean | – | true; `false` hides on canvas, excluded from grid/safe-mode/offset math; print gate is `needPrinting` | `LD:LayerMeta`; `print-grid.ts:54`, `layer-offsets.ts:47` |
| drawingColorIndex | integer | index into `DRAWING_COLORS` | 0 | all types except image |
| antiColor | boolean | – | false | text, barcode, qrcode, time, arctext, degrees, image, table cells |

Palette: `DRAWING_COLORS = ['#FFFFFF','#000000','#FFFFFF','#E53935','#43A047','#48C3C7']` (`T`). Index 0 and 2 are white and render as design ink (`inkColor` in `element-renderer.tsx:86-88`). The label-level default colour index is read from the same array (`label-settings.tsx:195`). **The index is meaningless if the array ever changes → manifest must record the palette used (§7).** `LABEL_DRAWING_COLORS` (9 entries, `LS`) is defined; where it is used I did not check **[unverified]**.

### 2.1 text — `EditorElementState` (`T`)

| field | type | unit | default | lives in |
|---|---|---|---|---|
| text | string | – | `'Text'` (new: `NEW_TEXT_PLACEHOLDER`) | T |
| fontSize | number | **points** (1 pt = 25.4/72 mm, `ptToMm` `LD:531`) | 8.5 | T |
| fontFamily | string | name (see §5) | `'Default'` | T |
| bold / italic / underline / strikethrough | boolean | – | false | T |
| align | `left`\|`center`\|`right`\|`justify`\|`spacing` | – | `'left'` | T `TextAlign` |
| contentType | `Manual`\|`Degrees`\|`Data Source` | – | `'Manual'` | T `ContentType` |
| serial | SerialConfig? | see §2.14 | absent | T → SR |
| columnNameContent | string | column header | `''` | T |
| charSpacing | number | **mm** (`visible-text-layout.ts` `charSpacingMm`) | 0 | T |
| lineSpacing | `'1.0'`\|`'1.5'`\|`'2.0'`\|`'Custom'` | multiplier; Custom = 1.75 (`textBlockHeightMm` `LD:539`); no numeric custom field exists | `'1.0'` | T |
| autoWrapping | `Close`\|`Char`\|`Word` | – | `'Word'` | T |
| verticalDisplay | boolean | – | false | T |
| autoTextHeight | boolean | – | true | T |
| height | number? | mm; **absent when auto-height** | absent | T |
| degreesOffset | number? | step count | absent. **Hidden legacy field**: not in the type, but the text panel patches it (`text-property-panel.tsx:174,299,408`). Must pass through. | not in T |

### 2.2 barcode — `BarcodeElementState` (`T`)

| field | type | unit | default | lives in |
|---|---|---|---|---|
| contentType, serial, columnNameContent | as text | | `'Manual'`, absent, `''` | T |
| content | string | – | `'0123456789'` | T |
| encodeMode | string (type is `string`) | one of `BARCODE_MODES`: CODE-128, CODE-39, ITF, EAN-13, EAN-8, UPC-A (`barcode-code128.ts:311`); unknown → code128 (`encodeModeToSymbology`) | `'CODE-128'` | T |
| textFlag | `Hide`\|`Top`\|`Bottom` | – | `'Bottom'` | T |
| fontFamily / fontSize / bold / italic / underline / strikethrough / align | as text | pt | `'Barcode'`, 12, false, `'center'` | T |
| width / height | number | mm | 26 / 10 | T |

### 2.3 qrcode — `QrcodeElementState` (`T`)

| field | type | unit | default | lives in |
|---|---|---|---|---|
| contentType, serial, columnNameContent | as text | | | T |
| content | string | – | `'https://seznik.in'` | T |
| encodeMode | `QRCode`\|`PDF417`\|`DataMatrix` | – | `'QRCode'` | T |
| errorLevel (QR error correction) | `L`\|`M`\|`Q`\|`H` | – | `'L'` | T |
| zoneSize (quiet zone) | `'0'`\|`'2'`\|`'4'` | **unit not verified** | `'0'` | T |
| codeShape | `Auto`\|`Square`\|`Rectangle` | – | `'Auto'` | T |
| degreesOffset | number | step count (legacy serial step) | 1 | T |
| width / height | number | mm | 12 / 12 | T |

### 2.4 line — `LineElementState` (`T`)

| field | type | unit | default | lives in |
|---|---|---|---|---|
| lineStyle | `solid`\|`dashed`\|`slash`\|`backslash` | – | `'solid'` | T |
| virtualInterval | number | mm (dash gap; UI min 0.1) | 1 | T |
| width | number | mm (length) | 33.6 | T |
| height | number | mm (thickness) | 0.5 | T |

### 2.5 shape — `ShapeElementState` (`T`)

| field | type | unit | default | lives in |
|---|---|---|---|---|
| figureShape | `rectangle`\|`roundedRectangle`\|`oval`\|`circle` | – | `'rectangle'` | T |
| fill | boolean | – | false | T |
| fillColor | string? (hex) | – | absent → palette colour; UI setter not located **[unverified]** | T |
| lineWidth | number | mm (stroke) | 0.75 | T |
| roundRadius | number | mm | 2.25 | T |
| width / height | number | mm | 33.6 / 24 | T |

### 2.6 table — `TableElementState` (`T`) + `TableCellContent` (`TC`)

| field | type | unit | default | lives in |
|---|---|---|---|---|
| lineWidth | number | mm | 0.75 | T |
| rowCount / columnCount | integer | 1..10 (`createTableState`) | 2 / 3 on the picker | T |
| rowHeights | number[] | mm, length = rowCount | equal split (`divideTableRowHeights`) | T |
| columnWidths | number[] | mm, length = columnCount | equal split | T |
| cells | TableCellContent[][]? | rows × cols | `resizeTableCells` fills defaults | T → TC |
| width / height | number | mm | 80 / 26 | T |

`TableCellContent` (each cell): text `''`, fontSize 10 pt, fontFamily `'Default'`, bold/italic/underline/strikethrough false, align `'left'`, contentType `'Manual'`, columnNameContent `''`, charSpacing 0 mm, lineSpacing `'1.0'`, autoWrapping `'Word'`, verticalDisplay false, antiColor false, drawingColorIndex 0, degreesOffset?, serial? — `TC:25-47`. **No merge, per-cell border, per-cell fill or per-cell rotation exists** in the type. Whether sums of rowHeights/columnWidths must equal height/width: **[unverified]**; importer warns, does not repair.

### 2.7 time — `TimeElementState` (`T`)

| field | type | unit | default | lives in |
|---|---|---|---|---|
| offsetDay / offsetHour / offsetMinute / offsetSecond | integer | days / hours / minutes / seconds added to "now" at print; sign/range limits **[unverified]** | 0 | T |
| fontFamily, fontSize, bold, italic, underline, strikethrough, align | as text | pt | `'Default'`, 12, false, `'center'` | T |
| width / height? | number | mm | 32 / absent | T |

No format field exists; output is fixed `YYYY-MM-DD HH:mm:ss` (`formatLiveDateTime`). Never store a date.

### 2.8 arctext — `ArcTextElementState` (`T`)

| field | type | unit | default | lives in |
|---|---|---|---|---|
| contentType, serial, degreesOffset, columnNameContent | as above | | `'Manual'`, absent, 1, `''` | T |
| text | string | – | `''` | T |
| lineWidth | number | mm | 0.25 | T |
| fontFamily, fontSize, bold, italic, underline, strikethrough | as text | pt | `'Default'`, 7.5 | T |
| width / height | number | mm | 20 / 20 | T |

No arc angle or radius field is stored; the arc is derived from the box.

### 2.9 degrees (Serial / Counter) — `DegreesElementState` (`T`)

| field | type | unit | default | lives in |
|---|---|---|---|---|
| contentType | ContentType | – | `'Degrees'` | T |
| serial | SerialConfig? | §2.14. **Present = new serial; absent = frozen legacy Counter** | absent | T |
| degreesOffset | number | step | 1 | T |
| content | string | template text | `'015'` | T |
| columnNameContent, charSpacing, lineSpacing, autoWrapping, verticalDisplay, autoTextHeight | as text | | | T |
| fontFamily, fontSize, bold, italic, underline, strikethrough, align | as text | pt | `'Default'`, 8.5, `'left'` | T |
| width / height? | number | mm | 59.27 / absent | T |

Do not export the *current* counter value; continue-from-last lives outside the document (`serial-continue-store`; comment at `LD:236`).

### 2.10 image — `ImageElementState` (`LD:45-83`)

| field | type | unit | default | lives in |
|---|---|---|---|---|
| uri | string | asset reference (§4) | required | LD |
| printUri | string? | asset reference, full-resolution print copy | absent → uses `uri` (`printImageUri`) | LD |
| flipH / flipV | boolean? | – | false | LD |
| contentFit | `fill`\|`contain`\|`cover` | – | `'contain'` (panel fallback) | LD |
| colorMode | `Original`\|`B & W`\|`Halftone` | – | `resolveEditorColorMode` fallback **[unverified value]** | LD |
| grayThreshold | number? | 0..255 grey level | 128 (panel `?? 128`) | LD |
| tile | boolean? | – | false | LD |
| contentType | `Local Image`\|`Data Source` | – | `'Local Image'` | LD |
| columnNameContent | string? | – | absent | LD |
| aspectRatioLocked | boolean? | – | true (panel `?? true`) | LD |
| originalAspect | number? | width ÷ height | absent | LD |
| workingWidthPx / workingHeightPx | number? | **pixels** of the working copy (image metadata, not geometry) | absent | LD |
| fitLabelSource | boolean? | – | false | LD |
| imageMode (image mode) | `solid`\|`floyd`\|`atkinson`\|`ordered`? | dither algorithm | absent = legacy path (`modedImageSettings` `image-element-settings.ts`) | LD |
| threshold | number? | 1..254 | absent (falls back to `grayThreshold`, then `DEFAULT_IMAGE_THRESHOLD`) | LD |
| brightness / contrast | number? | -100..100 | absent | LD |
| invert | boolean? | – | absent. With `imageMode` set, `antiColor` XOR `invert` decides final inversion (`image-element-settings.ts`) | LD |

Crop: **no field**. Crop output is a new file (`applyImageCrop`). Smart-crop/aspect state is `originalAspect` + `aspectRatioLocked`. `Data Source` images take the cell text as `uri`/`printUri` at bind time (`data-binding.ts:23-27`) — see §8 risk.

### 2.11 clipart — `ClipartElementState` (`LD:85-102`)

| field | type | unit | default | lives in |
|---|---|---|---|---|
| clipartId | string | built-in id (resolved through `CLIPART_ID_ALIASES`) or user-clipart id | required | LD |
| symbol / glyph | string? | purpose not traced **[unverified]**; pass through | absent | LD |
| tile | boolean? | – | false | LD |
| colorMode / grayThreshold | as image | | | LD |
| strokeScale | number? | multiplier 0.5..3 | 1 | LD |

### 2.12 border — `BorderElementState` (`LD:104-119`)

| field | type | unit | default | lives in |
|---|---|---|---|---|
| borderStyle | `BorderStyleId` (≥18 ids, `constants/border-library.ts`) | – | required; unknown → `resolveBorderStyle` fallback | LD |
| lineWidth | number | mm | required | LD |
| geometryVersion | `1`? | – | absent = legacy → inset by 2 mm on migrate (`border-geometry.ts`) | LD |
| edgeGapMm | number? | mm, Josh-only, center-line gap to die-cut edge | absent = default | LD |
| left/top/width/height | number | mm; new border = label inset 2 mm (`PRINT_BORDER_INSET_MM`), `lockMovement:true`, `rotation:0` | | LD |

### 2.13 signature — `SignatureElementState` (`LD:121-133`)

| field | type | unit | default | lives in |
|---|---|---|---|---|
| strokes | `{points:{x,y}[], strokeWidth}[]` | x,y = fraction of element width/height (0..1); strokeWidth = fraction of element width (`denormalizeStrokes`, `SP:26-34`) | required | LD → SP |
| colorMode / grayThreshold | as image | | | LD |

### 2.14 SerialConfig (`SR`) — shared by text, barcode, qrcode, arctext, degrees and table cells
`v:1`, `id` (stable field id; **keep as is**, `linkTo` points at it), `kind` (`number`\|`decimal`\|`letters`\|`alnum`\|`hex`\|`custom`), `start` (string), `step` (string), `prefix?`, `suffix?`, `minWidth?` (chars), `padChar?`, `decimals?` (0..8), `rounding?` (`half-up`\|`down`), `letterCase?`, `excluded?`, `alphabet?`, `repeatEach?` (default 1), `overflow?` (`extend`\|`wrap`\|`stop`, default `extend`), `checkDigit?` (`none`\|`mod10`\|`symbology`), `linkTo?`. No units (counts/characters). Reuse the app's own config validator rather than a second one **[unverified: exact validator name in `src/lib/serial/`]**.

---

## 3. Label-level table (`LabelDocument`, `LD:205-242`)

| field | type | unit | range / default if missing | in file? | lives in |
|---|---|---|---|---|---|
| id | string | – | regenerated on import; old value kept as `manifest.labelId` for same-origin detection | no (manifest only) | LD |
| name | string | – | ≤200 chars (proposed); required | **yes** | LD |
| widthMm / heightMm | number | mm | required; 1..2000 (proposed) | **yes** | LD |
| orientation | `0`\|`90`\|`180`\|`270` | degrees | 0 | **yes** | LD |
| paperType | `Receipt`\|`Label`\|`Cardstock`\|`Transparent`\|`Black mark` | – | unknown/missing → `Label` (`readPaperType`) | **yes** (stock type, not a printer value) | LD |
| mediaShape | `rectangle`\|`roundedRectangle`\|`circle`\|`ellipse`\|`diecut` | – | absent = rectangle | **yes** | LD |
| mediaGeometry | rectangle / rounded_rectangle{radiusMm?} / circle / tag / jewelry / rat_tail{bodyWidthMm, bodyHeightMm, tailLengthMm, tailHeightMm, tailPosition, cornerRadiusMm?} | mm | absent | **yes** | MG |
| elements | LabelElement[] | – | ≤500 across all panels (proposed) | **yes** | LD |
| background | `none` \| `color{color:hex}` \| `image{uri}` | – | `createLabelDocument`: Transparent paper → none, else white | **yes** (image → asset) | LD |
| templatePreviewType / templateCategory | string? | – | absent | **yes** (drives die-cut chrome via `templateUsesDieCutBackground`) | LD |
| templateSvg | `{xml:string}`? | SVG | absent | **yes, only through the strict SVG sanitiser (§8)**; ≤256 KB | LD |
| ups | `{columns, columnSpacingMm, batchEdit, activeIndex, panels: LabelElement[][]}`? | columns 2..6 (`createUpsConfig`), spacing mm (may be negative) | absent | **yes** | LD |
| upsTile | `{shape:'circle'\|'ellipse', columns, gapMm, cellWidthMm, cellHeightMm, originXMm, originYMm}`? | mm | absent | **yes** | LD |
| serialBatch | `{v:1, count}`? | labels; ≤5000 (`MAX_SERIAL_BATCH`) | absent | **yes** | SR |
| bulk | BulkLabelSet? | see §6 | absent | **yes, data-free unless opted in** | BL |
| referenceImage | `{fileName, widthPx, heightPx, rotation?, needPrinting?}`? | px; file in `sezprint/images`, safe-name regex `^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$` | absent | **yes** (asset; ≤2048 px edge) | LD |
| settings | LabelSettings? | see below | `defaultLabelSettings()` | **partly** | LS |
| groupId | string\|null | – | – | **no** (local folder) | LD |
| createdAt / updatedAt | number | epoch ms | – | **no** (reset to now); manifest keeps `createdAt` for info | LD |

No default font, default unit, margin or "label border settings" field exists on the document. Border settings live on the `border` element (§2.12). Display unit is an app preference, not on the label (`label-geometry.ts` `LabelUnit`; not stored in the doc) **[src]**.

### 3a. `LabelSettings` — stays in / stays out (`LS:19-48`)

| field | unit | Decision | Reason |
|---|---|---|---|
| mirrorMode, mirrorRowsCount, mirrorSpacingMm, mirrorRowNumber | enum / count / mm | **IN** | Layout: they generate the `ups` panels already stored in the doc |
| flagLabel | bool | **IN** | Selects cable-flag die-cut geometry already in the doc |
| defaultDrawingColorIndex | index | **IN** | Layout-neutral; palette-dependent |
| dataSourceFileId | id | **REWRITE** | Points at a local Excel store id; set to null unless data is shipped, else remapped (§6) |
| gapLengthMm | mm | **DECISION** | Roll/media hardware property, default 3. Stored on the label today |
| flipHorizontally | bool | **DECISION** | Changes output direction; printer/feed dependent |
| antiColor (label) | bool | **DECISION** | Inverts output; usage not traced **[unverified]** |
| printGrid, printGridSpacingMm, printRuler | bool / mm / bool | **DECISION (proposal: OUT)** | They print ink on the label; calibration/aid, not design |
| printDarkness, printSpeed | number\|null | **OUT** | Printer-specific; Josh values differ in range and base from TD-404 |
| hOffsetMm, vOffsetMm | mm | **OUT** | Calibration for one printer |
| elementsOffsetXMm/YMm, borderOffsetXMm/YMm | mm | **OUT** | Print-page nudges for one printer/paper |

### 3b. Never in the file (with reason)

| Item | Reason |
|---|---|
| Printer model/id/name, bridge (Tejas/Rudra/Josh/Dev) | Recipient has a different printer; label must open on any |
| DPI, dots, TSPL geometry (`createPrintGeometry`) | Derived at print time from mm; **[src]** the document contains no dots |
| Calibration (border, position, auto-offset) | Per-printer (`border-calibration.ts` etc.) |
| Darkness, speed, gap, offsets | Listed above |
| Counter/serial progress, print history, serial-continue offset | Runtime state, not design |
| Live time value | Offsets only |
| Account, email, phone, device ids, auth tokens | Privacy |
| Absolute `file://` paths, `content://`, cloud URLs | Break on another phone; security |
| `groupId`, `createdAt`/`updatedAt`, label `id` | Local identity |
| Editor view state: zoom, pan, selection, undo history | Not in the document [src] |
| Compiled raster caches, `workingWidthPx` derived data beyond what is listed | Regenerable |

---

## 4. Units: where internal units differ and how to convert

All **[src]** unless marked.

| Domain | Internal unit | In file | Conversion |
|---|---|---|---|
| Label size, element left/top/width/height, lineWidth, roundRadius, charSpacing, virtualInterval, edgeGapMm, column/row sizes, ups spacing, media geometry | **mm** (`LD:200-204` comment; `LabelDocument` has no px/dots) | mm, unchanged | none |
| Font size | **points** | **points** [proposal: keep] | `mm = pt × 25.4 / 72` (`ptToMm`). Converting pt→mm→pt risks float drift; points are a physical, DPI-independent unit → keep and document. Needs your OK (Q3) |
| Rotation | degrees; stored number but `normalizeRotation` rounds to quarter turns | degrees 0/90/180/270 | apply `normalizeRotation` on import; pivot convention not verified **[unverified]** |
| Signature points/stroke | fraction of the element box | unchanged (unit-less) | none |
| Image working size | pixels (`workingWidthPx/HeightPx`, `referenceImage.widthPx/heightPx`) | pixels (image metadata only) | none; never used as geometry |
| Print raster | **dots** at printer DPI (203/300) | never | `mmToPixels(mm, dpi)` in `unit-conversion.ts`; produced only at print |
| Screen | px via `pxPerMM`, zoom/pan | never | editor-only; `LD` comment: geometry is "never a function of zoom/pan" |
| Display unit (mm/cm/in) | `LabelUnit` in `label-geometry.ts` | never | UI only |
| Serial / time offsets | counts | counts | none |

Template design space is also mm (`TemplateDefinition.designWidth/Height`).

Proposed numeric clamps (importer, mirrors the existing `cleanSampleLayout` style in `template-sample.ts`): position −1000..1000 mm; width/height 0.1..2000 mm; fontSize 1..400 pt; lineWidth 0..100 mm; opacity 0..1; threshold 1..254; brightness/contrast −100..100; strokeScale 0.5..3; non-finite → field default. Clamping of *values* is allowed; clamping *elements to the label* is not (see correction 6).

---

## 5. Assets: images and fonts

### Images [src]
- Each image element normally owns two files in `{documentDirectory}/sezprint/images/`: a working copy `uri` (≤2000 px long edge, JPEG q0.85, `image-ingest-native.ts:65-73`) and a print copy `printUri` (original pixels; PNG stays PNG, else JPEG q0.92, `:61-62`). Both are stored as absolute file URIs. `background.image.uri` and `referenceImage.fileName` are the other image references.
- **Container:** ZIP (deflate), as in the draft. `assets/images/{sha256-first-16-hex}.{png|jpg}`; `assets/clipart/{…}.{svg|png|jpg}`; `assets/fonts/{…}.{ttf|otf}`. Names are content-derived, never user-supplied; zip names are lookup keys only.
- **De-duplication:** by SHA-256 of bytes. Same bytes referenced by several elements, by `uri` and `printUri` (when identical), by ups panels and by bulk `slotTemplates` → one asset, many references.
- **Ship both `uri` and `printUri`?** Recommend yes: the editor/preview draws `uri`, print draws `printUri`; regenerating the working copy would change JPEG bytes and break byte-identical previews. Cost ≈ 2× image size (Q6).
- **Limits:** as the draft §3 (12 MB per image, ≤8000 px edge, ≤40 MP, header read before decode, 30 MB file, 80 MB decompressed). Note the app itself caps at 2000 px working / 2048 px reference, so legitimate files stay well inside.
- Allowed by content sniffing: PNG, JPEG; WebP only if the pipeline decodes it **[unverified]** (user clipart extensions allow it).
- **Zip handling [run]:** `fflate` 0.8.3 is present only transitively (`package-lock.json`, not in `package.json`). Verified: `unzipSync(data, {filter})` gives `name`, compressed `size` and declared `originalSize` **before inflating**, so entries can be rejected cheaply; it also **accepts `../evil.txt` as a name**, so all path checks are ours. Declared sizes can lie, so also count real output bytes.
- User clipart: bundled (their ids exist only on the sender's phone, `user-clipart-store.ts`), remapped to new ids on import; recipient cap `MAX_USER_CLIPART = 200` (`add` returns null when full). Built-in clipart/borders/emoji: **ids only** (draft §5), resolved through `CLIPART_ID_ALIASES`.

### Fonts [src]
- `fontFamily` stores a **name** string: `'Default'`, `'Barcode'`, a `FONT_LIBRARY` name/id, or an installed-font name/id/familyKey. Used by text, barcode, time, arctext, degrees and every table cell.
- Resolution: `lookupFontFamily` (`fonts/lookup.ts`): installed first, then bundled library faces; `Default`/`Barcode`/unknown/uninstalled catalog → unset → **system sans-serif** (Noto routing for scripts via `resolveTextFontFamily`). Readiness helpers exist: `isFontNameReady`, `needsFontDownload` (`fonts/availability.ts`).
- Three font classes: **bundled** (Inter, Poppins, Roboto…, in the app binary, `app-fonts.ts`) → name only; **catalog** (downloaded from jsDelivr fontsource on tap, `FontLibraryItem.downloadUrl`) → name only; **imported** (user file, `source:'imported'`) → optional bundle.
- **Missing-font fallback [proposal]:** keep the stored `fontFamily` name untouched (so installing later fixes it); draw with the system sans-serif; import screen lists each missing font with: *Download* (only for names found in the app's own `FONT_LIBRARY`; the URL always comes from the app, never from the file), *Install bundled copy* (only if shipped and the user opts in), or *Use substitute*. Warn that line breaks/sizes will differ.
- Gaps found: `collectDocumentFontNames` (`fonts/lookup.ts`) scans `doc.elements` and table cells only — **not `ups.panels` or `bulk.slotTemplates`**; the export collector must cover them. Installed-font cap `MAX_INSTALLED_FONTS = 40`.
- **Fidelity limit:** `'Default'` is the platform system font (San Francisco on iOS, Roboto on Android). Text width differs between platforms, so "identical raster on any phone" cannot hold for `Default` text across OSes (Q4).
- Font licence cannot be checked by the app; bundling stays opt-in with the draft's notice.

---

## 6. Bulk / Excel data

Stored today [src]: `LabelDocument.bulk: BulkLabelSet` (`BL`) → `excelFileId`, `sheetIndex`, `rowCount`, `slots[{id:'col:N', columnIndex, columnName, kind}]`, `slotTemplates: Record<slotId, LabelElement>`, `sharedGeometry` (mm), `rowGeometryOverrides` (mm, sparse by row), `rowContentOverrides` (**cell text**, sparse), `activeRowIndex`, `barcodeEncodeMode`, `qrErrorLevel`, `displayHead?`, `copiesColumnIndex?`, `rowCopiesOverrides?`. The data itself lives in `ImportedExcelFile` (`DS`): `id`, `name`, `uri`, `sizeBytes?`, `sheets[{name, columns[], rows[][]}]`, `activeSheetIndex`, `importedAt`, `hasHeaderRow`, `dataStartRow`. Also `settings.dataSourceFileId`, and elements with `contentType:'Data Source'` + `columnNameContent`, and `{{column}}` tokens in text/content (`data-binding.ts:36-42`).

Opt-in design [proposal, extends draft §6]:

| Toggle | Included | Not included |
|---|---|---|
| **Off (default)** | `bulk` structure: `slots`, `slotTemplates`, `sharedGeometry`, `rowGeometryOverrides`, `barcodeEncodeMode`, `qrErrorLevel`, `displayHead`, `copiesColumnIndex` (column index only), column **names** as `bulk.slots[].columnName` + `manifest.dataColumns`, `rowCount` as a display number; `dataMissing:true` | Every cell, `rowContentOverrides`, `rowCopiesOverrides` (row-indexed, meaningless without rows), `ImportedExcelFile` (name, uri, sizeBytes), original `.xlsx` |
| **On** | parsed `sheets` (columns + rows as JSON) for the sheet(s) used, with `hasHeaderRow`, `dataStartRow`, plus `rowContentOverrides` and `rowCopiesOverrides` | Original `.xlsx`/macros/formatting; `uri`; `sizeBytes` |

- Privacy warning before enabling, naming the file and row count (draft wording).
- Column mapping on import: by column **name** first, then index; unmapped slots listed in the summary; user may pick one of their own imported sheets.
- Per-row copies: `copiesColumnIndex` travels with the structure; `rowCopiesOverrides` only with data.
- Import creates a new `ImportedExcelFile` (fresh id via `generateId('xls')`), then rewrites `bulk.excelFileId` and `settings.dataSourceFileId`; with no data both are unset. `ImportedExcelFile.uri` has no real file for an embedded copy → mark embedded **[unverified: code that expects a file at `uri`]**.
- Limits: draft §3 (≤10 sheets, ≤5000 rows, ≤100 cols, ≤8 MB).
- `slotTemplates` hold full elements → they go through the same element validation and font/asset collection.

---

## 7. Proposed file layout and examples

```
label.sezlabel            ZIP (deflate or stored). MIME application/vnd.sezprint.label+zip (draft §1)
├─ manifest.json          container info, palette, file list + sha256, notShared (informational)
├─ document.json          LabelDocument-shaped, ids/URIs rewritten, no groupId/createdAt/updatedAt
├─ assets/images/<sha16>.png|jpg
├─ assets/clipart/<sha16>.svg|png
├─ assets/fonts/<sha16>.ttf|otf        (M4, opt-in)
├─ data/excel.json                     (M2, opt-in)
└─ preview.png                         (≤512 px edge; display hint only, never trusted)
```

`manifest.json` container fields are **new by nature** (they do not exist on any app type today); everything inside `document.json` follows the existing types.

Example manifest (example only):
```json
{
  "format": "sezlabel",
  "schemaVersion": 1,
  "minAppVersion": "1.0.0",
  "createdWithAppVersion": "1.0.0",
  "createdAt": 1790000000000,
  "labelId": "label_mhx2k1_1a3f",
  "labelName": "Shelf tag",
  "labelSizeMm": { "w": 50, "h": 30 },
  "palette": ["#FFFFFF", "#000000", "#FFFFFF", "#E53935", "#43A047", "#48C3C7"],
  "includesData": false,
  "files": [
    { "path": "document.json", "bytes": 1204, "sha256": "…" },
    { "path": "preview.png", "bytes": 9120, "sha256": "…" }
  ],
  "fonts": [{ "family": "Default", "source": "system" }],
  "notShared": ["printer", "dpi", "offsets", "darkness", "speed", "gap"]
}
```

Example `document.json` (example only; every key below exists today):
```json
{
  "schemaVersion": 1,
  "name": "Shelf tag",
  "widthMm": 50,
  "heightMm": 30,
  "orientation": 0,
  "paperType": "Label",
  "mediaShape": "rectangle",
  "background": { "type": "color", "color": "#FFFFFF" },
  "elements": [
    { "id": "el_1", "type": "border", "borderStyle": "solid-thin", "lineWidth": 0.5,
      "geometryVersion": 1, "left": 2, "top": 2, "width": 46, "height": 26,
      "rotation": 0, "lockMovement": true, "needPrinting": true, "drawingColorIndex": 0 },
    { "id": "el_2", "type": "text", "text": "Basmati Rice 1 kg", "fontSize": 8.5,
      "fontFamily": "Default", "bold": true, "italic": false, "underline": false,
      "strikethrough": false, "align": "left", "rotation": 0, "left": 4, "top": 4,
      "width": 30, "lockMovement": false, "needPrinting": true, "antiColor": false,
      "drawingColorIndex": 1, "contentType": "Manual", "columnNameContent": "",
      "charSpacing": 0, "lineSpacing": "1.0", "autoWrapping": "Word",
      "verticalDisplay": false, "autoTextHeight": true, "zIndex": 1 },
    { "id": "el_3", "type": "qrcode", "contentType": "Manual",
      "content": "https://seznik.in", "encodeMode": "QRCode", "errorLevel": "L",
      "zoneSize": "0", "codeShape": "Auto", "degreesOffset": 1, "columnNameContent": "",
      "rotation": 0, "left": 34, "top": 8, "width": 12, "height": 12,
      "lockMovement": false, "needPrinting": true, "antiColor": false,
      "drawingColorIndex": 1, "zIndex": 2 }
  ]
}
```

---

## 8. Versioning and safety (extends draft §2–3; deltas only)

**Versioning [proposal, from draft]:** `manifest.schemaVersion` (int, 1) and `minAppVersion`; app older than `minAppVersion` → refuse whole file with "Update Sez Print". Apps without `.sezlabel` support at all simply cannot open it. No `schemaVersion` on the stored `LabelDocument` in v1 (no change to saved labels). Unknown fields: kept (pass-through) but still subject to size/depth/prototype-key checks. Unknown element `type`: kept raw, not drawn, listed in "missing items" (Q9). Unknown enum value inside a known element: keep the string; existing resolvers (e.g. `resolveBorderStyle`, `encodeModeToSymbology`, `readPaperType`) already fall back. Import migration order: schema steps → `migrateDocumentBorders` → `migrateDocumentReferenceImage` (both exist in `label-store.ts:10`) → new ids. **Export must read the document through `getDocument`** so it is already migrated.

**Deltas to the draft's security section:**
1. **Strict SVG allow-list for clipart *and* `templateSvg.xml`.** The existing `sanitizeUserSvg` is a weak deny-list (correction 8). `templateSvg.xml` is rendered by `TemplateSvgOverlay` straight from the document (`template-svg-overlay.tsx:12`), so an imported file would otherwise feed arbitrary XML to the SVG renderer.
2. **Data-bound image URIs.** `bindElementContent` assigns a spreadsheet cell to `element.uri` when `looksLikeImageUri` (`data-binding.ts:23-27`). With embedded Excel data, a cell with an `http(s)://` URL could cause a network fetch at print time. Importer must strip URL-like cells for image columns, or the binder must reject non-local URIs **[unverified: `looksLikeImageUri` accepts http]**.
3. **Auto-sweep race.** `sweepUnusedEditorImages` (`labels.ts`) deletes any `sezprint/images` file not referenced by saved labels, reference images or print history. Import must write assets and add the label to the store as one commit, or the sweep can delete freshly imported images.
4. **Script-like text:** text, `content`, `columnNameContent`, serial fields are drawn as glyphs/barcodes, never interpreted as HTML/JS. The only interpreted syntax is `{{column}}` tokens and `{column}` previews. Strip control characters like `cleanSampleLayout` does (`template-sample.ts`); length ≤10 000.
5. **Barcode/QR content vs symbology:** invalid content for EAN/UPC/ITF: encoder behaviour not verified (an empty string falls back to `0123456789` per `bulk-labels.ts:112` comment) **[unverified]**. Import must dry-run the encoder in try/catch and warn.
6. **Limits:** keep the draft §3 table. Additions from source: table ≤10×10 (`createTableState`), ups columns 2..6, `serialBatch.count` ≤5000, user clipart ≤200, fonts ≤40, SVG ≤256 KB, `slotTemplates` ≤ `bulk.slots` count ≤100.
7. Checksums detect corruption only; no signing in v1 (draft).
8. All-or-nothing commit with a temp dir; on any failure delete temp and show one message (draft).

---

## 9. Round-trip proof (export → import → identical)

Test name (proposed): **`src/lib/label-share/__tests__/roundtrip.test.ts`**, run as `npx tsx --tsconfig tsconfig.json --test …` with a new script `test:label-share` in `package.json` (same style as `test:serial`). Fixtures are built in code; no golden file is created or edited. **[src]** `rasterizeDocumentToBitmap(doc, 203, {backend:'dot-buffer'})` already runs headless in Node **[run]** and returns `{widthDots, heightDots, bytesPerRow, mono1bppBuffer}`.

Tiers:
1. **Structural (all 13 types, every optional field).** `normalize(importDoc(exportDoc(doc)))` deep-equals `normalize(doc)`, where `normalize` ignores only: element/label `id`, `createdAt/updatedAt`, `groupId`, and asset URIs (compared by sha256 of the bytes). A coverage test enumerates keys of every `DEFAULT_*_STATE`, `SerialConfig`, `TableCellContent` and the optional keys in §2 and fails if a fixture or the schema lacks one (schema-drift guard).
2. **Raster (Node).** For doc and re-imported doc: `mono1bppBuffer`, `widthDots`, `heightDots` byte-equal at 203 dpi and a second dpi. **Limit [src]:** the headless path throws for `table`, `time`, `arctext`, `degrees`, `signature`, non-moded images, user clipart and tiled clipart (`skia-rasterizer.ts:108-135`, `canHeadlessRasterPrint`). Tier 2 therefore covers text, barcode, qrcode, line, shape, border, built-in vector clipart and moded images with prepared tiles.
3. **Unsupported types (device).** Capture-path comparison on a phone using the existing capture fingerprint (`sha1Ascii`, `src/lib/debug/capture-hash.ts`) of the printed capture before export and after import; documented manual checklist. `time` is live, so only structure is compared.
4. **Idempotence.** `export(import(export(x)))` has the same `document.json` bytes (sorted keys, fixed zip timestamps).
5. **Settings neutral.** Raster equality is defined with `defaultLabelSettings()` on both sides, because offsets, flip, grid, ruler and darkness are deliberately not in the file (§3a); the test asserts that import does not set them.
6. Plus the draft §11 suites: malicious zips, version upgrade, privacy sentinel, conflict handling.

---

## 10. Sharing UX (extends draft §9; what exists today in italics)

- **Share** (`src/app/share.tsx`): *today it offers JSON (`{id}.sezlabel.json`, MIME `application/json`, with local `file://` URIs) and PNG.* Plan: replace the JSON action with "Label file (.sezlabel)". Options sheet: ☐ include my imported fonts (n) ☐ include spreadsheet data (N rows, with the privacy text) ☐ own clipart (n, on when used). Result line "Shared 'Name' — 3 images, 1 font, no data". Build the zip in cache; hand to `expo-sharing`.
- **Open:** "Open label file" in the labels/files picker (document picker is already wired and patched, `patches/expo-document-picker+14.0.8.patch`); works with no native change (M1).
- **Receive:** Android — extend the existing share-target module's intent filter with `.sezlabel` MIME + `pathPattern` fallback (**native rebuild**); iOS — document type + UTI in `app.json` `infoPlist` (**native rebuild**); today `app.json` has only `UIFileSharingEnabled` and `LSSupportsOpeningDocumentsInPlace`.
- **Import screen:** preview rendered from the parsed document (not the embedded `preview.png`), name, size mm, element count by type; summary rows: missing fonts, missing catalog items, data needed (columns), skipped/unknown elements, size-vs-printer note (needs a per-model max-media table that I did not find), "made with newer version". Nothing saved until **Add to my labels**. Always a new label (`groupId:null`, new ids, now timestamps), opened in the editor.
- **Same name / same label:** same `manifest.labelId` already present → Keep both (default, name " (2)") / Replace (explicit confirm, shows existing updated date) / Cancel. Same *name*, different id → add with " (2)" and no prompt (Q10). Replace never silent, never touches the open label.

---

## 11. Risks — what could break existing saved labels

1. **No change to stored data** is planned: no `schemaVersion` on `LabelDocument`, export is read-only, import only adds labels. Risk is confined to bugs in the new code path.
2. Running `normalizeDocumentElements` or `patchLabelDocument` on import would move elements, drop white circle fills, regenerate ups/flag geometry (`label-settings.ts` `patchLabelDocument`) → breaks identity. Import must write the document as-is after migrations.
3. Border migration is idempotent only via `geometryVersion`; exporting a document not read through `getDocument` could ship a legacy border and inset it twice on a second app with migration (draft test 4 covers).
4. `'Default'` font differs per OS → not pixel-identical across iOS/Android (§5).
5. Sweep race deletes imported images (§8.3).
6. Storage size: `label-store` persists all documents under one AsyncStorage key `sez-print/labels` plus a file per label; embedded `templateSvg.xml` and bulk `slotTemplates` grow it. Android AsyncStorage size limit not checked **[unverified]**.
7. Existing `.sezlabel.json` files already shared by users carry local URIs and cannot be imported (Q8). The on-device `.sezlabel.json` cache name stays unchanged; the new extension is `.sezlabel` (no collision).
8. Palette index: if `DRAWING_COLORS` changes, old files recolour; manifest `palette` lets import detect it.
9. Serial ids: `SerialConfig.id` / `linkTo` must be preserved or remapped together; element ids are safe to regenerate only if nothing else references them (print history, serial-continue-store keyed by label — keyed by what **[unverified]**).
10. SheetJS `xlsx@0.18.5` is already used on user-picked files today; embedding parsed JSON avoids adding exposure.
11. Dependencies/docs: `fflate` becomes a direct dependency (JS-only, no native rebuild). `AGENTS.md` says to read Expo **v57** docs, but `node_modules/expo` is **54.0.37** **[run: `grep version`]** — the right docs must be read before any build; I have not read docs.expo.dev in this planning pass.

---

## 12. Open questions for you (no guesses made)

1. Is there an M1 build on another branch or machine? The repo contains only the draft doc, no code.
2. Which Expo docs apply: `AGENTS.md` says v57, installed is 54.0.37?
3. Keep `fontSize` in **points** in the file (my recommendation) or convert to mm?
4. `'Default'` font differs on iOS vs Android: accept non-identical text rasters across OSes, or bundle/pin a face?
5. Settings still undecided: `gapLengthMm`, `flipHorizontally`, label `antiColor`, `printGrid` / `printGridSpacingMm` / `printRuler` — in or out of the file?
6. Ship both `uri` and `printUri` for images (exact, ~2× size), or only `printUri` and regenerate the working copy?
7. Keep `opacity` and `visible` in the file even though no renderer use of `opacity` was found?
8. Support importing old `.sezlabel.json` shares (local URIs, images lost), or explicitly not?
9. Unknown element type: keep as opaque (draft proposal) or drop with a warning?
10. Same name, different label: silently add " (2)", or ask?
11. Hidden `degreesOffset` on text elements: pass through as legacy, or drop?
12. OK to add `fflate` as a direct dependency?
13. Bulk without data: ship column names in the file (needed for mapping) — acceptable?
14. `templateSvg.xml`: embed (after strict sanitising), or re-resolve from the server catalog by template id (needs network)?
15. Where do per-model max media sizes live, so the import screen can compare the label to the recipient's printer?

---

## 13. Still to verify before building (unverified list)

`zoneSize` unit · renderer use of `opacity` · `shape.fillColor` setter · `clipart.symbol/glyph` purpose · Label Clone output · table row/column sum rule · time offset ranges · rotation pivot · barcode behaviour on invalid content · `looksLikeImageUri` scheme list · WebP in the image-element pipeline · `PhotoFrameDef` output · where `LABEL_DRAWING_COLORS` and label `antiColor` are used · serial validator name · AsyncStorage size limit · what keys serial-continue-store and print history use.
