# .sezlabel — universal label share format (design, plan only)

Status: DRAFT, awaiting approval. No code written.
Evidence tags: **[src]** = from reading source. **[run]** = verified by running.
Nothing in this doc is tagged [run]: I ran no code. Every claim is [src] or an explicit proposal.

## 0. What exists today [src]

- `LabelDocument` (`src/lib/label-document.ts`): id, name, widthMm, heightMm, orientation, paperType, mediaShape?, mediaGeometry?, elements[], groupId, createdAt, updatedAt, background?, templatePreviewType?, templateCategory?, ups?, bulk?, settings?. All geometry is mm.
- **No `schemaVersion` exists** anywhere in the document. The only version-like field is `BorderElementState.geometryVersion?: 1`.
- Migration today = `migrateDocumentBorders` (`src/lib/border-geometry.ts`). It runs on store rehydrate and on `getDocument` (`label-store.ts`). It insets any border without `geometryVersion === 1` by 2 mm and sets `geometryVersion: 1`, `rotation: 0`, `lockMovement: true`. It also covers `ups.panels`.
- Existing "share template" (`src/app/share.tsx`) writes `JSON.stringify(doc)` to `{id}.sezlabel.json` and shares it as `application/json`. **Problem:** it keeps local `file://` image/font URIs, so the file breaks on another phone. There is **no importer** (grep finds none).
- `persistLabelFile` and print-history snapshots already use the `.sezlabel.json` name (`labels.ts`, `snapshot-file.ts`). The new `.sezlabel` extension must not collide with these. Keep `.sezlabel.json` as the internal on-device cache; `.sezlabel` is the zip.
- No zip library in `package.json`. `fflate` and `pako` are present in `node_modules` only as transitive deps. [src]
- `app.json` has URL schemes `sezprint`, `sez-print`, iOS `UIFileSharingEnabled` + `LSSupportsOpeningDocumentsInPlace`. No intent filters, no document types. [src]

## 1. Package layout

`.sezlabel` = ZIP (deflate). MIME `application/vnd.sezprint.label+zip`.

```
manifest.json      format info, checksums, contents list
document.json      LabelDocument, with URIs rewritten to package paths
assets/            images/{n}.png|jpg, clipart/{n}.svg|png, fonts/{n}.ttf|otf
data/              excel.json (parsed) and/or excel.xlsx (original)  -- optional
preview.png        thumbnail, max 512 px edge, display only
```

`manifest.json`:
`format:"sezlabel"`, `schemaVersion` (int), `minAppVersion` (semver string), `createdWithAppVersion`, `createdAt`, `labelId`, `labelName`, `labelSizeMm {w,h}`, `catalogVersion`, `files[] {path, bytes, sha256}`, `fonts[]`, `catalogRefs[]`, `includesData` (bool), `notShared[]` (informational).

Checksums are for corruption detection only. They do **not** authenticate the file; an attacker can recompute them. No signing in v1.

### Fields per element type [src]
Every element: `id`, `type`, plus optional `LayerMeta` (`opacity`, `zIndex`, `visible`). All types carry `rotation`, `left`, `top`, `width`, `lockMovement`, `needPrinting`.

| type | Fields (besides the common ones) |
|---|---|
| text | text, fontSize, fontFamily, bold, italic, underline, strikethrough, align, height?, antiColor, drawingColorIndex, contentType, columnNameContent, charSpacing, lineSpacing, autoWrapping, verticalDisplay, autoTextHeight |
| barcode | contentType, content, columnNameContent, encodeMode, textFlag, fontFamily, fontSize, bold, italic, underline, strikethrough, align, height, antiColor, drawingColorIndex |
| qrcode | contentType, content, encodeMode, errorLevel, zoneSize, codeShape, degreesOffset, columnNameContent, height, antiColor, drawingColorIndex |
| line | lineStyle, virtualInterval, height, drawingColorIndex |
| shape | figureShape, fill, fillColor?, lineWidth, roundRadius, height, drawingColorIndex |
| table | lineWidth, rowCount, columnCount, rowHeights[], columnWidths[], cells?[][] (each cell: text, fontSize, fontFamily, bold, italic, underline, strikethrough, align, contentType, columnNameContent, charSpacing, lineSpacing, autoWrapping, verticalDisplay, antiColor, drawingColorIndex, degreesOffset?), height, drawingColorIndex |
| time | offsetDay/Hour/Minute/Second, fontFamily, fontSize, bold, italic, underline, strikethrough, align, height?, antiColor, drawingColorIndex |
| arctext | contentType, degreesOffset, columnNameContent, text, lineWidth, fontFamily, fontSize, bold, italic, underline, strikethrough, height, antiColor, drawingColorIndex |
| degrees | contentType, degreesOffset, content, columnNameContent, charSpacing, lineSpacing, autoWrapping, verticalDisplay, autoTextHeight, fontFamily, fontSize, bold, italic, underline, strikethrough, align, height?, antiColor, drawingColorIndex |
| image | **uri**, **printUri?**, height, antiColor, flipH?, flipV?, contentFit?, colorMode?, grayThreshold?, tile?, contentType?, columnNameContent?, aspectRatioLocked?, originalAspect?, workingWidthPx?, workingHeightPx? |
| clipart | clipartId, symbol?, glyph?, height, drawingColorIndex, tile?, colorMode?, grayThreshold?, strokeScale? |
| border | borderStyle, lineWidth, height, drawingColorIndex, geometryVersion?, edgeGapMm? |
| signature | strokes[] {points[] {x,y}, strokeWidth}, height, drawingColorIndex, colorMode?, grayThreshold? |

Document-level objects that also travel: `background` (`none` / `color` / `image{uri}`), `mediaShape`, `mediaGeometry` (rectangle, rounded_rectangle, circle, tag, jewelry, rat_tail with its mm fields), `ups` (columns, columnSpacingMm, batchEdit, activeIndex, panels[][] of elements), `bulk` (see §6), `settings` (see §7).

Type-lock: the exporter writes whatever is in the type. The importer validates against a hand-written schema (§3) that mirrors this table. To stop drift, a test must fail when a field is added to a type but missing from the schema (see §11).

## 2. Versioning

- `schemaVersion` starts at 1. It is a new top-level field in `manifest.json` (and in `document.json` as `schemaVersion` too). We do **not** add it to the stored `LabelDocument` in v1 (avoids touching existing saves).
- `minAppVersion`: lowest app version that can read this schema. Compared to `Constants.nativeAppVersion` [src: `build-identity.ts`]. If app is older: refuse with "Update Sez Print to open this label". Never half-open.
- **Unknown fields:** keep them. Importer passes unknown keys through on elements/document (the schema uses "passthrough", not "strict-strip"). They survive in storage and get re-exported. This lets a newer app's extra fields round-trip through an older app. Exception: unknown *keys* inside `manifest.json` are ignored, never executed.
- **Unknown element `type`:** keep the raw element in `document.json` form but do not render or print it; show it in the missing-items summary. (Needs an "opaque element" case — an open question, §12.)
- **Migrations on import:** order is fixed.
  1. Read `schemaVersion`; run `schema N → N+1` steps (none exist yet).
  2. Run the existing `migrateDocumentBorders`. Elements with `geometryVersion: 1` are untouched; legacy borders get the 2 mm inset. This is the same function used on rehydrate, so a shared old label behaves like a saved old label.
  3. Run `normalizeDocumentElements` only if the importer needs it (check; not verified).
  4. Assign new ids (§9).
- Never migrate on export. Export is a plain snapshot of the current document.
- Catalog drift: `CLIPART_ID_ALIASES` already maps old ids [src]. Importer resolves ids through it.

## 3. SECURITY (files are untrusted)

Rules the importer must follow. Nothing here is implemented yet.

**Zip handling**
- Do not use any "extract all to disk" call. Read the central directory, validate every entry **before** inflating anything, then inflate entries one at a time into memory (JSON) or a temp file (assets) with a running byte counter.
- Reject the whole file if any entry name: is absolute, starts with `/` or `\`, contains `..`, contains `\`, NUL, `:`, or control chars; has a drive letter; is a symlink (mode bits); has a duplicate name (case-insensitive); is not in the allowed path set below; or has a name longer than 100 chars.
- Never use the name from the zip as an on-disk file name. Destination is always generated: `{newId}.{ext}` via the existing `safeImportFileName` pattern [src: `paths.ts`] into `sezprint/images|fonts|clipart/`. Zip names are only lookup keys into `manifest.files`.
- Zip bomb: check the **declared** uncompressed size per entry and in total, then also enforce the limits **while inflating** (declared sizes can lie). Abort when exceeded. Reject ratio > 100:1 per entry. Reject nested archives (a `.zip`/`.sezlabel` inside).
- Zip64, encrypted entries, multi-disk, data descriptors with mismatched sizes: reject. Compression methods allowed: stored (0) and deflate (8) only.

**Limits (proposed, adjustable)**

| Limit | Value |
|---|---|
| `.sezlabel` file size | 30 MB |
| Entry count | 200 |
| Total decompressed | 80 MB |
| `document.json` | 5 MB |
| `manifest.json` | 256 KB |
| Single image asset | 12 MB, and ≤ 8000 px per edge, ≤ 40 MP |
| Single SVG | 256 KB |
| Single font | 8 MB |
| Fonts per file | 8 |
| Elements per label | 500 (all panels together) |
| Table | ≤ 10×10 (matches `createTableState`) |
| Signature | ≤ 50 strokes, ≤ 5000 points total |
| Excel (parsed) | ≤ 10 sheets, ≤ 5000 rows, ≤ 100 cols, ≤ 8 MB total |
| String length | text/content ≤ 10,000 chars; id/name ≤ 200 chars |
| JSON nesting depth | ≤ 32 |

**Allowed asset types** (by content sniffing, not by extension): PNG, JPEG, (WebP only if the app already decodes it — unverified), SVG, TTF, OTF, XLSX/JSON data. Reject GIF/HTML/exe/anything else. Image dimensions are read from the header **before** decoding; reject over the pixel limit.

**SVG:** parse with the app's existing SVG parser (`src/lib/clipart/parse-svg.ts`; its safety is not yet reviewed — open question). Allow-list tags (`svg, g, path, circle, ellipse, rect, line, polyline, polygon, defs, linearGradient, stop, clipPath`) and attributes. Strip/reject `script`, `foreignObject`, `use` with external href, `image`, `style` with `url()`, any `on*` attribute, any `href` that is not `#id`. No network fetch ever.

**JSON validation**
- Parse with `JSON.parse` (no reviver), then validate with an explicit schema. Numbers must be finite; clamp mm values to sane ranges (e.g. −1000…1000 mm; widthMm/heightMm 1…2000). Enums must match the unions in §1. Reject `__proto__`, `constructor`, `prototype` keys at any depth (prototype pollution).
- Any `uri`/`printUri`/`fileUri` in `document.json` must be of form `assets/<name>` and present in `manifest.files`. Any `file://`, `http(s)://`, `content://`, `data:` URI is rejected or stripped (**no network loads, no local-file reads**). This is the main privacy/safety rule: a shared file must never make the app read an arbitrary path or call a URL.
- `bulk.excelFileId` and `settings.dataSourceFileId` are rewritten by the importer (§6); incoming values are never trusted as store keys.

**No code execution:** no eval, no dynamic require, no scripts in SVG, no macros (XLSX is parsed as data only by SheetJS `xlsx@0.18.5` [src: package.json]; **note** this version has known prototype-pollution / ReDoS advisories — upgrade or prefer embedding parsed JSON, §6).

**Failure behaviour:** all-or-nothing. Write assets to a temp dir; only commit to the label store and `sezprint/` after every check passes; on any error delete the temp dir and show one plain message. Never log file contents. Never include the zip's file names in a native crash path.

## 4. Fonts

- Elements reference `fontFamily` by name (`'Default'`, `'Barcode'`, a library name, or an imported family key) [src].
- `manifest.fonts[]` = `{family, source: "library" | "imported", file?, license?}`, built from every `fontFamily` used (including table cells, arctext, barcode, time, degrees).
- Built-in/library fonts (`FONT_LIBRARY`, `APP_FONT_MAP`): names only, never bundled. Recipient has them or can download.
- **User-imported fonts** (`source: 'imported'` in `InstalledFontRecord`): bundle only if the user ticks "Include fonts" in the export sheet, after a notice: "Only include fonts you have the right to share." Default off. Font licence is not machine-checkable; we do not claim to check it. Fonts are never auto-bundled.
- Import: bundled fonts are not installed silently. The import screen lists them with "Install font" (per-font toggle, default off); if declined, the label uses fallback.
- Missing font (not bundled, not on device): label opens with the app's existing fallback resolution (`src/lib/fonts/resolve-font.ts`; not read in detail — verify) and the import screen shows "Font X missing — text will use a substitute; line breaks and sizes may differ." Text widths change, so the warning is shown before Save.
- Font cap: `MAX_INSTALLED_FONTS = 40` [src]; importing must respect it and say so.

## 5. Catalog items (clipart, border, Line Emoji)

What is stored today [src]: clipart elements hold `clipartId` (+ optional `symbol`, `glyph`); border holds `borderStyle` (one of 14 `BorderStyleId`s); Line Emoji lives in `LINE_EMOJI` and appears as clipart category `'emoji'`. Built-in art is code-defined (SVG strings in the app bundle).

**Recommendation: ids + `catalogVersion`, do not bundle built-in artwork.** Reasons: art is already in every install; bundling bloats files and creates an SVG attack surface for no gain. Missing id (newer app made the file) → placeholder box + entry in the missing-items summary; the element keeps its id so a later update can render it.

**Exception — user clipart** (`source: 'user'`, files in `sezprint/clipart/`): not in anyone else's catalog, so these **are** bundled as assets (SVG or image), and the element's `clipartId` is remapped to the new local id on import.

`catalogVersion`: an integer to add (new constant; does not exist yet) bumped whenever catalog ids are added. Import compares; a higher value than the app's plus a missing id gives the "update the app" hint.

Unverified: how `clipartId` resolves for user clipart vs built-in (resolution code not read).

## 6. Excel

Today: `ImportedExcelFile` {id, name, uri, sheets[{name, columns, rows}], activeSheetIndex, hasHeaderRow, dataStartRow, ...}; `bulk.excelFileId` points at it; `bulk.sheetIndex`, `rowCount`, `slots`, `slotTemplates`, `sharedGeometry`, `rowGeometryOverrides`, `rowContentOverrides` [src]. `settings.dataSourceFileId` also references a file id.

Options: (a) parsed sheets JSON, (b) original `.xlsx`.
**Recommend (a) parsed sheets only**: already in the store (so no re-parse), no macro/format risk, smaller, no SheetJS on untrusted input. Original xlsx not shared (lose formatting we do not use anyway).

Rules:
- Export sheet toggle "Include spreadsheet data" — **default OFF** when `bulk` or any `contentType: 'Data Source'` exists. Before turning it on show: "This file will contain every row of '{name}' (N rows). It may include names, phone numbers or prices. Share only if the recipient should see it."
- Without data: the label ships with the bulk setup (slots, templates, overrides) but `bulk` is marked `dataMissing: true`, `rowCount` kept for display. On import, the user sees "This label needs a data file: columns [A, B, C] expected" and can pick one of their own spreadsheets; mapping is by column **name**, then index.
- Row content overrides (`rowContentOverrides`) contain data too (edited cell strings). They are stripped when data is not included.
- Consistency: importer creates a new `ImportedExcelFile` with a **fresh id**, then rewrites `bulk.excelFileId` and `settings.dataSourceFileId` to it. If data is absent, both are set to `null`/unset, never left pointing at a dead id. `ImportedExcelFile.uri` points to nothing for an embedded file; mark it `embedded: true` (new field) so code that expects a file on disk does not break (to be checked).
- Text/barcode/QR elements with `contentType: 'Data Source'` + `columnNameContent` keep working only if a matching column exists; otherwise they show in the missing-items summary.

## 7. Intentionally NOT shared

- Printer calibration and offsets: border calibration (`src/lib/printer/border-calibration.ts`), position calibration, per-printer saved offsets, TD-404 shifts. Printer-specific.
- `settings.printDarkness`, `printSpeed`: exported as **hints** only (`settings.hints.darkness`, `speed`) and ignored by default on import. Josh values are printer-specific and 0-based (stated by the owner; `bridge-quality-caps.ts` shows Josh as `LEGACY`, i.e. no cap range, so I could not verify the 0-base from code). A hint is never applied automatically; the recipient's own printer setting stays.
- `settings.hOffsetMm`, `vOffsetMm`, `flipHorizontally`, `gapLengthMm`, mirror options: calibration-like. Decision needed (open question): default is to **drop** `hOffsetMm/vOffsetMm`, keep `mirrorMode`/`flagLabel` (they change the layout meaning).
- Runtime counters: serial/counter history and the current serial value. A `degrees` element keeps its template `content` ("015") and `degreesOffset` step, not any "last printed" state. (Where counter history is stored was not located; verify no field on the document holds it.)
- Live time: `time` elements keep only offsets (day/hour/minute/second); never a baked date/time.
- Print history, cloud/auth data, user email, device ids, `groupId` (local folder id → reset to null), `createdAt` (reset on import), absolute `file://` paths, printer identity.

## 8. Label size vs the recipient's printer

- The file carries `labelSizeMm`, `orientation`, `paperType`, `mediaShape`, `mediaGeometry`, `ups`.
- On import: if a printer is connected/selected, compare to its supported media. I did not find a clean "max printable width" table in `printer-models.ts` (grep for width fields found nothing), so **the rule below is a proposal that needs the real limits wired in**:
  - Fits: no message.
  - Too wide/tall for the selected printer: block *printing* with "This label is W×H mm; your printer prints up to X mm." Import still allowed; user can use the existing resize flow (`scaleDocumentToSize` / `repositionDocumentToSize` in `element-sizing.ts`, not read in detail).
  - No printer selected: import with a neutral "Label size W×H mm — check it matches your paper."
  - Die-cut geometry (`rat_tail`, jewelry, cable flag): warn that this stock must be loaded; do not auto-convert to a rectangle.
- Border `edgeGapMm` is Josh-specific; kept in the doc, ignored by other printers (already how it behaves per its comment [src]).

## 9. Import / export UX

**Export** (replace the current "share template" button in `share.tsx`):
1. Sheet: "Share label" → "Label file (.sezlabel)" / "Image (PNG)" (existing).
2. Options: ☐ Include my imported fonts (n) ☐ Include spreadsheet data (N rows) ☐ Include my own clipart (n, always on if used). Each with a one-line explanation.
3. Build zip in cache → system share sheet (`expo-sharing`, already used) with the preview.png shown as the file thumbnail if the OS supports it.
4. Result line: "Shared 'Name' — 3 images, 1 font, no data."

**Import** (opened from file association, or "Open label file" in the labels list/picker):
1. Validate (§3). On failure: one plain error ("This file isn't a valid Sez Print label"); no partial result.
2. Preview screen: preview image **rendered from the parsed document** (not the embedded `preview.png`, which could lie), name, size, element counts.
3. Summary: Missing fonts, missing catalog items, data needed, size/printer warning, "made with newer version" notice.
4. Conflict: same `labelId` already exists → choices: **Keep both** (default; new id, name + " (2)"), **Replace** (explicit confirm; shows existing updated date), Cancel. Replace never happens silently.
5. Destination: always a **new** label in the user's labels list (`groupId: null`, new id, `createdAt = updatedAt = now`), then open in the editor. Never overwrite the currently open label. All element ids are regenerated (`generateId`) and `ups` panels too.
6. Nothing is saved until the user taps "Add to my labels".

## 10. File association

- **Android** (`AndroidManifest` intent filters via `app.json` → `android.intentFilters`, or an existing config plugin like `plugins/with-local-file-picker-queries.js`): `VIEW` + `SEND`, `DEFAULT` + `BROWSABLE`, `mimeType application/vnd.sezprint.label+zip`, plus a `pathPattern ".*\\.sezlabel"` filter with `mimeType */*` (many apps send zips as `application/octet-stream`). Content arrives as `content://` — must be read through `expo-file-system` / a stream, never assumed to be a path.
- **iOS**: `UTExportedTypeDeclarations` (UTI `com.sezprint.label`, conforms to `public.data` + `public.zip-archive`, extension `sezlabel`, the MIME type) and `CFBundleDocumentTypes` (role Viewer, `LSHandlerRank Owner`) in `infoPlist`. Existing `LSSupportsOpeningDocumentsInPlace: true` [src] means files may open in place — copy to the temp dir first before reading.
- The app receives the file via `expo-linking` initial/URL events routed to an import screen. No such handler was found in `_layout.tsx` (grep returned none).
- **This needs a NATIVE REBUILD** (new dev/EAS build; `npx expo prebuild` regenerates AndroidManifest/Info.plist). OTA/refresh is not enough. Manual file-picker "Open label file" works without the association, so it can ship earlier.
- Sharing from the app does not need the association; only "tap file in WhatsApp/Files → opens Sez Print" does.

## 11. Test plan (jest, no golden files)

Tests build their fixtures in code; none are stored snapshots.

1. **Round trip per element type** (13 types: text, barcode, qrcode, line, shape, table, time, arctext, degrees, image, clipart, border, signature): build doc → export → import → deep-equal except regenerated ids/timestamps. Plus: `ups` doc, `bulk` doc (with and without data), `background` image/color/none, each `mediaGeometry` variant, rotated and locked elements, `LayerMeta`.
2. **Schema drift guard:** a test that enumerates keys of every `*ElementState` default (`DEFAULT_*_STATE`) and fails if the import schema lacks them.
3. **Malicious zips** (generated programmatically): `../evil` entry; absolute path; backslash path; duplicate names; symlink entry; zip bomb (small file, huge declared size); bomb with false declared size; ratio >100:1; entry count 201; nested zip; encrypted entry; Zip64; truncated file; wrong CRC; `manifest.files` hash mismatch; asset not listed in manifest; listed but missing; polyglot (PNG header with HTML body); oversize-pixel PNG; SVG with script / foreignObject / external href; `document.json` with `__proto__`, NaN-like strings, huge strings, depth 100, `file://` and `https://` URIs, 10,000 elements, 1,000 table cells over limit; unknown font file with `.ttf` name but wrong bytes. Expect: rejected, nothing written to `sezprint/`, temp dir removed.
4. **Version upgrade:** a legacy document (border without `geometryVersion`) imports and ends with `geometryVersion: 1` and the 2 mm inset; an already-migrated border is not inset twice; legacy ups panels also migrate.
5. **Old app opens new file:** simulate `schemaVersion = current+1` and `minAppVersion` above the app → clean refusal; `schemaVersion` same but with extra unknown fields/elements → imports, unknown fields preserved through a second export; unknown element type → listed as missing, not dropped.
6. **Privacy:** export without data contains no row text anywhere (search the zip bytes for a sentinel string); `rowContentOverrides` stripped; export with data warns.
7. **Conflict handling:** same id → "keep both" yields new ids everywhere, "replace" only after confirm.
8. Device smoke (manual): Android `content://` open from WhatsApp, iOS Files in-place open, large image doc.

## 12. Open questions / not verified

Not verified (no code was run; some code not read):
- Whether `fflate` can be used directly from React Native in this app (it is only transitive). A direct dependency would need adding → **new JS dep, JS-only, no native rebuild by itself**.
- `src/lib/fonts/resolve-font.ts` fallback behaviour, `parse-svg.ts` safety, user-clipart id resolution, `normalizeDocumentElements` role on import.
- Printer max media width/height per model; Josh darkness/speed range and 0-base (only seen as `LEGACY` caps).
- Where serial/counter history lives (assumed not in the document).
- WebP support in the image pipeline.
- SheetJS `xlsx@0.18.5` advisories: a recommendation here, not checked against a current advisory list.
- Whether existing users have an expectation on the old `.sezlabel.json` share (old files already shared would not import; a legacy importer for plain JSON could be offered or explicitly not supported).

Decisions I need from you:
1. Drop `hOffsetMm`/`vOffsetMm` on import? (proposal: yes)
2. Include imported fonts at all in v1? (proposal: no)
3. Excel original xlsx ever? (proposal: no, parsed only)
4. Unknown element type: keep as opaque, or drop with a warning? (proposal: keep opaque)
5. Limits in §3: OK or adjust?

## Smallest first milestone worth shipping

**M1 — JSON + images + user clipart, picker-only import, no native rebuild.**
- Export: `manifest.json` + `document.json` + `assets/` (images, user clipart) + `preview.png`. No fonts, no Excel (elements that need data are exported as plain text/placeholders and flagged "data not included").
- Import: manual "Open label file" via the document picker (not file association). Full §3 validation, §9 preview + missing-items summary (fonts by name, catalog ids), "keep both" only, always a new label.
- Includes the full §11 malicious-zip and round-trip suites and `schemaVersion`/`minAppVersion` from day one.
- Not in M1: fonts bundling, Excel embedding, Replace option, file association (needs native rebuild), printer-size block (warning text only).

Then: M2 Excel (parsed, privacy prompt) → M3 file association (native rebuild) → M4 optional fonts.

Rebuild note: M1 and M2 are JS-only (refresh), assuming `fflate` is acceptable as a direct dependency. M3 requires a native rebuild.
