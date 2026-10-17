# Serial Labels: engine, fields, editor and print integration

Status: DRAFT for review. Nothing is implemented. Stack checked against package.json:
Expo ~54.0.37, expo-router ~6.0.24, React Native 0.81.5 (AGENTS.md mentions Expo 57 docs; not followed).

---

## 1. Step 0: current state (read from code, nothing changed)

### 1.1 Home tile and screen
- Tile `serialLabels` in `src/components/home/home-tools.ts:18`, route `/serial-label`, in the Create grid.
- `src/app/serial-label.tsx` (recently rewritten): collects sample text ("Desk1"), last number, step, zero-pad, barcode type.
  Then pushes `/new-label-setup` (size screen, `serial*` params). That screen builds the series and opens `/edit`.
- How the series is built today: the engine expands every label up front, a **fake Excel file** is written into the data
  store (`uri: serial://label/<ts>`, columns Text and Barcode), and the label is created as a **bulk document**
  (`createBulkLabelDocument`) whose text and barcode slots are bound to those two columns.
  So a serial label today is "an Excel import nobody imported".

### 1.2 SerialLabelEngine.ts (`src/lib/printer/SerialLabelEngine.ts`)
- Supports: one integer sequence parsed from the LAST digit run of a sample string (prefix / digits / suffix),
  start / end / step (direction inferred), text zero-padding, barcode mirrors text, barcode symbology
  CODE128 / CODE39 / EAN13 / UPCA / CUSTOM with EAN13 and UPC-A check digits.
- Limits: `number` (JS float) arithmetic; integers only; no letters, decimals, hex, wrap or overflow rules;
  materialises the whole array (cap `MAX_SERIAL_RANGE = 5000`); the count is derived from an end value, not stored.
- Callers: `serial-label.tsx`, `new-label-setup.tsx`, `serial-label-document.ts`.
- Tests: only `src/lib/__tests__/serial-label-document.test.ts` (document wiring). No engine unit tests.
- Note: the barcode check-digit logic here duplicates `eanChecksum` in `src/lib/barcode-code128.ts`.

### 1.3 The Counter element and "Content Type"
- **Counter is not its own type.** The Add-menu item "Counter" (and "Degrees") calls `addElement('degrees')`
  (`edit.tsx` ~3913; `palette-drop.ts:29` maps `Counter: 'degrees'`). The saved element is `type: 'degrees'`.
- Stored fields (`DegreesElementState`, `components/editor/types.ts:444`): `contentType: 'Degrees'` (default),
  `content` (start text, default `'015'`), `degreesOffset` (step, default 1), plus text styling.
- `ContentType = 'Manual' | 'Degrees' | 'Data Source'` (`types.ts:7`). Text, ArcText, Barcode, QRCode and table
  cells also carry `contentType` / `degreesOffset`. In the barcode and QR panels "Degrees" shows as a Content Type
  choice with a "Degrees Offset" stepper. The word "Counter" is the Add-menu name; "Degrees" is the stored name.
- Value rule: `applySerialOffset(content, step, pageIndex)` (`src/lib/serial-content.ts`): regex
  `^(\D*)(\d+)(\D*)$`, adds `step * pageIndex` to the digits, keeps zero padding width. Digits only; no letters;
  one number; JS numbers (so beyond 2^53 it loses precision).
- **Preview value:** renderers (`element-renderer.tsx`, `skia-element-renderer.tsx`, print `convert.ts:225`) call
  `applySerialOffset(content, step, 1)`: **pageIndex is hard-coded to 1**. So the canvas shows start + step
  (015 shows as 016), never the typed start.
- **Print value:** per-page documents come from `resolveDocumentForPage` (`data-binding.ts`), which applies
  `step * pageIndex` to the content, and then the renderer applies one more step (the hard-coded 1). Net: label
  `n` shows start + step * (n + 1). This looks like an existing off-by-one. Needs confirming on a device before
  we decide whether to preserve it (see Open Questions).
- **When it increments at all:** only when a data sheet exists. `pageCount` in `print.tsx` is 1 unless the label is
  bulk, an Excel job, or has an attached sheet with `autoPages`. A Counter label with no sheet prints N identical
  copies (copies repeat the same page document; they never advance).

### 1.4 Data binding, bulk and the print queue
- `data-binding.ts`: `resolveDocumentForPage(doc, sheet, pageIndex)` clones the doc, fills `Data Source` elements and
  `{{token}}` text from the sheet row, then applies Degrees offsets. `dataPageCount` decides page count.
- `bulk-labels.ts`: a "bulk" document (`doc.bulk: BulkLabelSet`) projects slots from sheet columns per row
  (`projectBulkDocument`), with per-row geometry and content overrides. `bulk-row-copies.ts` plans per-row copies
  (`planBulkPrint`, `bulkSendList`, `MAX_JOB_LABELS = 500`, collate option).
- Print loop: inline in `src/app/print.tsx` (~1040-2010). Builds `printJobs` (page, sendCopies, copyNumber, round),
  renders and sends one at a time, updates `printProgress` text "Printing X of Y", logs `[print] label N copy ...`.
  - **Cancel: none** (no abort check in the loop). **Retry/resume: none**; on error it alerts "Sent X of Y".
  - History is written once at the end with the total copies.
- `src/printer-core/queue.ts` has a persisted, resumable `PrintQueue` (row data persisted, failed item left for
  explicit reprint, designed for numbered runs). It is **only used by tests** (`router.test.ts`); print.tsx does not
  use it. `src/printing/printer/PrintQueue.ts` is a separate one-job-at-a-time mutex used by the universal bridge.

### 1.5 Add menu classification

| Item | Real type | Serializable | Reason / what changes |
|---|---|---|---|
| Text | `text` | **Yes** | Content is `text`. Already has `contentType`/`degreesOffset`. Add `serial` config. |
| Barcode | `barcode` | **Yes** | Content is `content`. Needs per-symbology validation and a width-fit check on the longest value. |
| QRCode | `qrcode` | **Yes** | Content is `content`. Needs payload-length validation. |
| Counter | `degrees` | **Yes (is the serial element)** | Becomes the default Serial text element (see 5.4). |
| ArcText | `arctext` | **Yes** | Content is `text`; already has `contentType`/`degreesOffset`. |
| Table | `table` | **Yes, later phase** | Cells carry text, `contentType`, `degreesOffset` (`table-cells.ts`). Per-cell config; phase 5. |
| Time | `time` | No (for now) | Time-derived, no free text. Possible later "date/time serial" phase. |
| Image, Clipart, Line Emoji | `image` / `clipart` | No | No text content. |
| Line, Shapes, Border, Signature | `line` / `shape` / `border` / `signature` | No | Graphics only. |
| Excel | creator | No | Imports a sheet as a bulk set (Data Source). A different batch source. |
| Scan, OCR, ASR | creators (`/scan`, `/ocr`, `/asr`) | No | They create text/barcode elements with literal text; those elements can then be serialized. |
| Label Clone | creator | No | Copies another label; serial config on cloned elements is copied with them. |

### 1.6 Overlap and inconsistencies
1. **Three serial mechanisms:** (a) Counter/Degrees (`applySerialOffset`, per-element, needs a sheet to advance),
   (b) `SerialLabelEngine` + fake Excel + bulk doc (Serial Labels screen), (c) bulk/Excel Data Source. (a) and (b) are
   unrelated code that do similar things with different rules (regex vs last-digit parse, padding rules differ).
2. **Counter preview != start:** hard-coded `pageIndex 1` (1.3).
3. **Possible double step on print** (1.3).
4. **Copies never advance** a counter; users who want N different serials must use a sheet.
5. **Check digits duplicated** in the engine and in `barcode-code128.ts`.
6. Serial Labels screen creates a hidden Excel file per use; these accumulate in the data store.

---

## 2. Serial field schema and storage

### 2.1 One field = one config on one element

```ts
// src/lib/serial/types.ts
export type SerialKind = 'number' | 'decimal' | 'letters' | 'alnum' | 'hex' | 'custom';
export type SerialOverflow = 'extend' | 'wrap' | 'stop';

export interface SerialConfig {
  v: 1;                       // schema version
  id: string;                 // stable field id (NOT the element id; survives clone/ups panels)
  kind: SerialKind;
  start: string;              // exact text: "1", "0042", "12.50", "AA", "7F"
  step: string;               // exact signed text: "1", "-5", "0.25"; letters: whole positions
  // more options
  prefix?: string;
  suffix?: string;
  minWidth?: number;          // pad width of the VALUE part (prefix/suffix excluded)
  padChar?: string;           // single char, default "0" (numbers/decimal/hex/alnum), first alphabet char for letters
  decimals?: number;          // decimal kind only, 0..8
  rounding?: 'half-up' | 'down';  // applied once when start/step are parsed, never per step
  letterCase?: 'upper' | 'lower'; // letters / alnum / hex
  excluded?: string;          // characters to skip, e.g. "IOQ"
  alphabet?: string;          // custom kind only; base = unique chars
  repeatEach?: number;        // same value on N consecutive labels, default 1
  overflow?: SerialOverflow;  // default 'extend'
  checkDigit?: 'none' | 'mod10' | 'symbology';
  linkTo?: string;            // another SerialConfig.id on the same label ("same serial as")
}
```

Attached as an optional property on the element: `serial?: SerialConfig` on `text`, `barcode`, `qrcode`, `degrees`,
`arctext` (and table cells in phase 5). Strings, not numbers, so values survive JSON and long numbers stay exact.

### 2.2 Label-level batch state

```ts
// LabelDocument.serialBatch?: 
export interface SerialBatch {
  v: 1;
  count: number;              // number of LABELS in the batch (not distinct values)
  continueFromLast: boolean;  // opt-in
  continueOffset: number;     // labels already printed in earlier batches (index offset); 0 by default
}
```

- **Preview index** is UI state in the editor (not saved).
- Stored per label design in the saved document, so "continue from last" is tied to that design. Reset button sets
  `continueOffset = 0`. Written only after a successful print (section 6).
- Absent `serialBatch` and absent `serial` = every existing label, unchanged.

### 2.3 Migration (no file rewrite)
- Existing `degrees` elements and any element with `contentType === 'Degrees'` stay as they are.
- A read-time adapter `legacyToSerial(el): SerialConfig | null` derives a config: kind `number`, start/prefix/suffix/
  minWidth from the regex split of `content` (`^(\D*)(\d+)(\D*)$`), step = `degreesOffset`, overflow `extend`.
  Non-matching content (no digits) = not serial (same as today: unchanged).
- The first time a user edits the serial settings in the new panel, the element is written with an explicit `serial`
  and `contentType: 'Degrees'` kept so older builds still read it.
- The stored value `'Degrees'` is never renamed. The UI label becomes "Serial".
- Existing documents made by the old Serial Labels flow (bulk + `serial://` sheet) keep working through the bulk path.

---

## 3. Engine design (pure TypeScript, node-testable, `src/lib/serial/`)

Files: `types.ts`, `alphabet.ts`, `decimal.ts`, `engine.ts`, `check-digit.ts`, `legacy.ts`, `index.ts`. No React Native imports.

### 3.1 Signatures

```ts
export type SerialResult =
  | { ok: true; value: string }
  | { ok: false; reason: 'overflow' | 'underflow' | 'invalid-config'; message: string };

/** The value for any label index. O(1) in index. No loops from start, no state. */
export function valueAt(config: SerialConfig, index: number): SerialResult;

/** valueAt + linkTo resolution + prefix/suffix + check digit; what an element should display. */
export function resolveField(configs: Record<string, SerialConfig>, id: string, index: number): SerialResult;

/** The widest value in labels [offset, offset+count). Does not generate the batch. */
export function longestValue(config: SerialConfig, count: number, offset?: number): string | null;

export function firstAndLast(config: SerialConfig, count: number, offset?: number): { first: string; last: string } | null;

/** Plain-language problems, empty array when valid. */
export function validateConfig(config: SerialConfig, count: number, offset?: number): SerialIssue[];

export interface SerialIssue { field: keyof SerialConfig | 'count'; message: string; severity: 'error' | 'warning' }
```

`index` is the 0-based label index; the engine adds `continueOffset` before calling. `valueIndex = floor((index+offset) / repeatEach)`.

### 3.2 Arithmetic
- **Number:** `BigInt` throughout. `start`, `step` parsed with a strict regex into BigInt (so 25 digits is fine; tested
  to at least 30). `value = start + step * valueIndex`. Negative values allowed only if the user starts negative;
  otherwise crossing below zero is `underflow` (stop with message) unless overflow = `wrap`.
- **Decimal:** scaled integers. Parse `start`/`step` to BigInt scaled by `10^decimals`; extra input digits are
  rounded once (`rounding`) at parse. `valueAt` is exact BigInt math, formatted back by inserting the decimal point.
  No floats, so no drift (0.1 * 3 is exactly 0.3). `minWidth` pads the integer part.
- **Padding:** `minWidth` pads the digits with `padChar` to the left. A value longer than `minWidth` follows the overflow
  mode.

### 3.3 Letter and character types (defined rule)
Alphabet = base set (letters A-Z; alnum 0-9A-Z; hex 0-9A-F; custom = given) minus `excluded`, case applied. Base `N` = size.
- **Letters = bijective (spreadsheet columns):** A..Z, AA..AZ, BA..., since people expect A, B ... Z, AA. Index maps to
  the string by the standard bijective base-N conversion.
- **Alnum, Hex, Custom = positional, fixed width:** value is a base-N numeral of width `max(minWidth, length(start))`,
  left-padded with the first alphabet character (so hex `00FF`, alnum `0AZ`).
- `start` is converted to its ordinal, `ordinal(start) + step * valueIndex` is converted back. Start that contains a
  char outside the alphabet = `invalid-config` ("start contains 'I' which is excluded").
- **Overflow** when the ordinal passes the last value of the current width (positional) or the batch crosses a length
  boundary (bijective):
  - `extend`: continue (999 to 1000, Z to AA, FF to 100).
  - `wrap`: back to the first value of the starting width (999 to 000, Z to A).
  - `stop`: `ok: false, reason: 'overflow'`; the editor shows it and print is blocked.
- **Underflow** (stepping down past the first value): `wrap` goes to the last value of the width; otherwise `stop`.

### 3.4 Check digit
- `mod10`: Luhn digit appended to the numeric payload (digits only, otherwise validation error).
- `symbology`: the barcode element's encoder owns it. EAN-13 / UPC-A / EAN-8 payload (12 / 11 / 7 digits) gets the check
  digit; the engine calls the SAME function the renderer uses (extracted into `check-digit.ts`, re-used by
  `barcode-code128.ts`), so there is one implementation. `SerialLabelEngine.ts` check logic is removed in the same step.

### 3.5 Determinism
`resolveField` is the only entry point used by the editor preview, the print renderer and tests. Preview and print both call
`resolveDocumentForIndex(doc, i)` (6.2), so they cannot differ.

### 3.6 Longest value without generating
- Number/decimal/positional: values are monotonic in the index, so the longest is `first` or `last` of the batch (plus
  wrap case: the widest is the start width). Computed in O(1) from `valueAt(0)` and `valueAt(count-1)` under repeat and offset.
- Bijective letters: length grows monotonically; same rule.
- Rule is covered by a property test: `longestValue` equals the max over a brute-force expansion for random configs.

---

## 4. Barcode and QR validation design

`src/lib/serial/symbology-validate.ts`:

```ts
export function validateForBarcode(mode: string, value: string): SerialIssue | null;   // mode = editor encode mode
export function validateForQr(mode: QrEncodeMode, value: string, errorLevel: QrErrorLevel): SerialIssue | null;
export function validateBatchForElement(el: LabelElement, config: SerialConfig, count: number, offset: number): SerialIssue[];
```

- **Single source of truth:** valid = the real encoder accepts it: `barcodeModulesForMode(mode, value) !== null`.
  On top of that, specific messages: Code 39 allowed set (0-9 A-Z - . space $ / + %) so lowercase and `_` fail with a
  message naming the character; Code 128 (printable ASCII); EAN-13 needs 12 digits (+ auto check digit) or 13; UPC-A 11/12;
  EAN-8 7/8; ITF even digit count (odd count = warning "a leading 0 will be added" or error, decided in open questions).
- **QR/PDF417/DataMatrix payload limits:** byte length (UTF-8) checked against the limit for the chosen error level
  (QRCode L/M/Q/H max-bytes table; DataMatrix and PDF417 fixed caps), with the table kept in one constants file.
- **When checked:** in the editor on every serial config change: first, last, and a deterministic sample (~20 indices,
  always including first, last, and the first index after any wrap/extend boundary). Errors show under the field in the
  panel ("Label 38: 'abc' is not valid in Code 39"). Not at print time. Print only re-runs the check as a gate.
- **Width fit:** take `longestValue`, encode it, and compute the minimum element width at the current integer module size
  (reusing `snap1DBarcodeModules`). If the element is too narrow the editor shows a warning on the barcode with
  actions: shorter prefix, smaller module size (font/narrow), widen the element, or a wider label. For QR: required
  version vs element size; warn when modules would fall under the minimum printable dot size.
- **Do not touch rendering:** serial values flow through the existing barcode element renderer (integer module
  snapping, quiet zone, the ZXing-verified path). The serial layer only changes the string passed in.

---

## 5. Editor design

### 5.1 Entry from Home
- Serial Labels tile opens the size screen first (reuse `new-label-setup`, flag `isSerial`), then `/edit` with a new
  serial label: one `text` element with `serial` (Number, start 1, step 1) and `serialBatch.count = 10`.
- A "Add barcode with same serial" shortcut in the serial bar creates a barcode linked to the text field.
- The current detail screen (`serial-label.tsx`) and the hidden Excel file hack are retired in phase 2. Old docs keep working.

### 5.2 Property panel (per element)
- In the existing "Content Type" row: `Manual | Serial | Data Source`. (Stored value stays `'Degrees'` for Serial.)
- Serial selected shows the **simple view only**: Type, Start, Step, Count (Count shown here as a shortcut to the label-level value).
- **More options** (collapsed): Prefix and suffix, minimum width and pad character, decimal places (+ rounding),
  letter case, excluded characters, custom alphabet, repeat each N, when it runs past its width (Extend / Wrap / Stop),
  check digit, same serial as [field].
- Each field gets a one-line description (continuing the style used on the details screen).
- Inline validation messages from `validateConfig` and `validateBatchForElement`.
- One config change = one patch = one undo step (the whole `serial` object replaced in a single `patchSelected`).

### 5.3 Serial bar (label level)
- Shown when the label has at least one serial field. Count (editable), a preview stepper (first, previous,
  "12 / 50", next, last; reuse the visual pattern of `bulk-label-nav.tsx`), and a jump-to field.
- Every serialized element on the canvas shows `resolveField(..., previewIndex)`. Preview index 0 shows the START value.
- Also shows "Continue from last printed" toggle and "Reset" with the current offset.

### 5.4 What happens to Counter
**Recommendation: Counter becomes Serial: one engine, one panel.** Reasons: two panels teaching two rule sets was the
confusion; the legacy adapter keeps every saved Counter label reading identically; the "Counter" Add-menu item stays
(renamed "Serial" in the UI, "Counter" kept as an alias) and adds a `degrees`-typed element with a `serial` config.
The `degrees` element type and `contentType: 'Degrees'` stay in the saved format forever.

### 5.5 Interaction constraints
- Serial elements use the same selection, double-tap quick-edit, resize, multi-select and drag. No change to the Konva transformer.
- Quick-edit on a serial element edits `start` (as quick-value.ts already does for the Counter start value).
- Editor stays on Konva; Skia stays print-only.
- Theme tokens and shared components only; no new hex colors.

---

## 6. Print design

### 6.1 Batch expansion (pure)
```ts
export interface SerialPrintItem { labelIndex: number; serialIndex: number; copyNumber: number; round: number; copies: number }

export function expandSerialBatch(opts: {
  count: number; offset: number; copies: number; collate: boolean; startAt?: number;
}): SerialPrintItem[];
```
Shape matches the existing `bulkSendList` items (`rowIndex`/`copies`/`copyNumber`/`round`) so it could be shared later.
This function is independent of the Excel copies feature and does not change it.

### 6.2 One resolver for preview and print
`resolveDocumentForIndex(doc, serialIndex): LabelDocument` clones the document and replaces each serial element's text/
content with `resolveField(...)`. The editor preview, the print loop and the history snapshot all call it.
Each label is rendered once per label; the existing `rowRasters` cache pattern is reused for physical copies.

### 6.3 Totals and caps
- "Print 50 labels" total shown before sending (labels x copies). Existing `MAX_JOB_LABELS = 500` applies; above that a
  confirmation dialog, with a hard cap decided in Open Questions (old serial cap was 5000).

### 6.4 Progress, cancel, resume
- Progress: existing text becomes "Label 12 of 50 (value)"; cancel button sets an abort ref checked between items
  (a half-sent label is never abandoned; cancel takes effect after the current label completes).
- Resume: a small persisted `serialJob` store `{docId, batchId, total, nextIndex, failedIndex?, status}` written after each
  confirmed label. After a failure the app offers "Resume at label N" and "Reprint label N" (the failed label is not
  retried blindly, matching the design note in `printer-core/queue.ts`). Resume uses the same expansion list from `nextIndex`.
- Whether to run through the unused `printer-core` `PrintQueue` or keep the inline loop with this cursor: Open Question.
  Plan default: keep the inline loop (lower risk to every printer path) and add the cursor.

### 6.5 Repeat each value vs copies
- `repeatEach = N` is a VALUE rule: labels 0..N-1 share a value. `count` is labels, so 12 labels with N=3 = 4 distinct values.
- `copies = C` is a PHYSICAL rule: each label is sent C times.
- Combined: 12 labels, N=3, C=2 = 24 physical prints, 4 distinct values. Collate on = whole set then repeat.

### 6.6 Continue from last printed
- Updated only after the job completes (every item confirmed): `continueOffset += count`. Never at preview.
- If the job stops partway: offset advances by the number of fully confirmed labels only.
- Reset button in the serial bar.

### 6.7 Logging for device verification
Per item: `[serial-print] job=<id> label=<i>/<total> serialIndex=<n> value="<v>" copy=<c>/<C> state=<sent|confirmed|failed>`.

---

## 7. Tests (node, same `tsx --test` style as existing tests)

Engine (`src/lib/serial/__tests__/`):
- Random access equals sequential: for random configs (all kinds), `valueAt(i)` equals folding step i times.
- Step up and down, negative start, step larger than the width.
- Padding and `minWidth` with prefix/suffix; `padChar`.
- Overflow `extend` / `wrap` / `stop` for number, letters, alnum, hex, custom; underflow.
- Excluded characters (skip I, O, Q), custom alphabet and base, case.
- Long numbers: 18 and 30 digits exact; index near `Number.MAX_SAFE_INTEGER`.
- Decimals: 0.1 step x 1000 = exactly 100.0; rounding rule; decimals 0 and 8.
- `repeatEach` mapping; `linkTo` returns the identical value; link loops rejected.
- `longestValue` equals the brute-force max for random configs.
- `validateConfig`: step 0, count 0 / too large, empty alphabet, invalid start for the type, start with excluded char.

Validation: per symbology (Code 39 set, Code 128, EAN-13/UPC-A/EAN-8 with automatic check digit, ITF even digits, QR byte limits
per level), including first / last / boundary sampling and width-fit calculation.

Regression (must pass before each phase ships):
- Legacy Counter: a snapshot set of existing Counter documents (015 step 1, 001 step 5, letters prefix) resolve to the same
  strings as today through the legacy adapter, EXCEPT the documented off-by-one decision (Open Question 1).
- Non-serial labels: rasterized output hash identical before/after (use the existing print hash tooling).
- Old Serial Labels documents (bulk + `serial://` sheet) still open and print.

---

## 8. Phases (each shippable alone). Check a box when done.

### Phase 1: Engine and tests (no UI change)
- [ ] `src/lib/serial/` types, alphabet, decimal, engine (`valueAt`, `resolveField`, `longestValue`, `validateConfig`)
- [ ] Shared check-digit module; `barcode-code128.ts` uses it
- [ ] Legacy adapter `legacyToSerial`
- [ ] Full engine test suite (section 7) green
- [ ] `npx tsc --noEmit`: no new errors
- Ships alone: yes (pure code, nothing calls it yet).

### Phase 2: Editor panel and preview for text
- [ ] `serial?` on text/degrees/arctext; `serialBatch` on the document (optional, versioned)
- [ ] Content Type row: Manual / Serial / Data Source; simple view + More options + descriptions
- [ ] Serial bar with count and preview stepper; elements show `resolveField` at the preview index
- [ ] Counter folded into Serial (alias in Add menu); legacy Counter labels render through the adapter
- [ ] Home tile: size screen then editor; retire the fake-Excel path
- [ ] Undo as one step; selection/resize/multi-select regression checked on device

### Phase 3: Barcode and QR
- [ ] `serial?` on barcode and qrcode; symbology / payload validation in the panel
- [ ] Width-fit warning using the longest value; first/last/sample checks
- [ ] "Same serial as" link; "Add barcode with same serial" shortcut
- [ ] On-device scan test of first / middle / last labels

### Phase 4: Print queue and resume
- [ ] `expandSerialBatch` + `resolveDocumentForIndex` used by preview and print
- [ ] Totals before print, cap / confirmation, "Label N of M" progress, cancel between labels
- [ ] Persisted job cursor; resume / reprint after failure
- [ ] `[serial-print]` device logs captured; non-serial print hash unchanged

### Phase 5: Continue-from-last, table cells, polish
- [ ] `continueFromLast` with offset stored per design; reset; updated only after success
- [ ] Table cells serialized
- [ ] Copy / collate interaction verified with `repeatEach`
- [ ] Copy edits and empty-state polish

### Later (optional)
- [ ] Date/time serials
- [ ] Sequences from a pasted list

---

## 9. Risks
1. **Existing off-by-one (1.3)** may be relied on by users; fixing it changes printed numbers on old Counter labels.
2. **Print.tsx is large** and printer paths differ per SDK; adding cancel/cursor touches shared code. Mitigation: wrap, don't rewrite; hash tests.
3. **Bijective vs positional letters** is a user-visible rule; wrong default would confuse. Needs a decision.
4. **Barcode width-fit** depends on printer DPI; the editor estimate (203 default) may differ from the connected printer's real DPI.
5. **Persisted cursor vs edited label:** if the user edits the design between a failure and a resume, the resumed values must be re-resolved from the current design (documented: resume uses the CURRENT design).
6. **Multi-up / mirror (ups) labels:** serial ids must be stable across panels; per-panel behavior undefined (Open Question 6).
7. **Bulk (Excel) documents:** serial index vs row index when both exist (Open Question 5).
8. **Memory:** the old flow materialised up to 5000 labels; the new one does not, but rasters for large jobs must stay one-at-a-time.

## 10. Open questions (decide before Phase 2)
1. Counter off-by-one: confirm on a device what a 3-label Counter job prints today. Then: (a) keep "first label = start + step" for
   legacy labels only, or (b) fix everywhere so label 1 = the typed start? Recommended: (b), noted in release notes.
2. Letters: bijective (A..Z, AA) as the default, or positional? Recommended bijective.
3. Negative numbers: allowed only if the user starts negative, or never (stop at 0)? Recommended: allowed only if start is negative.
4. Maximum batch: keep 500 (`MAX_JOB_LABELS`), or raise (serial previously allowed 5000)? Recommended 5000 with a confirmation above 500.
5. Serial inside an Excel/bulk label: serial index = row index, or independent counter with its own count? Recommended: row index; the serial bar hides Count.
6. Multi-up labels: one serial value per physical label (all panels advance), or per panel? Recommended: per physical sheet, each panel gets the next value (needs a design pass).
7. ITF odd digit count: block with an error, or auto-prepend 0 with a warning?
8. Linked field and check digits: the barcode adds its own EAN check digit while the text shows the payload. Is "identical text" meant to include the check digit?
9. Run resume through the existing inline loop (plan default) or wire `printer-core` `PrintQueue`?
10. Keep the "Counter" name in the Add menu, or rename to "Serial"?

---

# Revision 1 (build pass; these decisions override earlier sections where they differ)

Single build pass, one git commit per logical step (engine, editor, barcode/QR, print, table cells, Home entry).

## R1.1 Decisions that changed
1. **Old flow stays.** `serial-label.tsx`, the `serial://` fake Excel file and the bulk-document path keep working untouched.
   The new flow is added beside it; removing the old one is a later cleanup. (Replaces the "retire in phase 2" line in 5.1 / phase 2.)
2. **Legacy Counter/Degrees output is frozen.** An element with `contentType === 'Degrees'` and no `serial` config keeps going
   through today's `applySerialOffset` code path, including the existing off-by-one (preview and print show start + step*(n+1)).
   `legacyToSerial` is kept for the "Upgrade to new Serial" action and for equivalence tests, but nothing resolves legacy
   elements through the new engine implicitly. New Serial elements (explicit `serial`) use the correct rule: label index 0 shows
   the typed start. Temporary `__DEV__` logs show the legacy strings (see report). Whether to fix old labels is a later decision.
3. **Letters are spreadsheet-style (A..Z, AA..).** minWidth and padChar are hidden for Letters (engine ignores them).
   Excluded characters shrink the base: excluding I and O from A-Z leaves 24 characters, so the sequence is base 24
   (..., H, J, K, ..., Z, AA, AB ...). Positional kinds (Alphanumeric, Hex, Custom) use fixed width and always pad with the
   first alphabet character; `padChar` applies to Number/Decimal only.
4. **Validation gate:** character-set symbologies (Code 39, Code 128) validate prefix, suffix and alphabet exactly;
   sampling is only for length-dependent checks. A pure string gate (`validateAllValues`) checks EVERY value in the batch
   before label 1 is sent.
5. **continueOffset is not in the label document.** It lives in a separate persisted store keyed by label id
   (`serial-continue-store`), so Clone, Save As, share, upload and template saves cannot carry it. The document only holds
   `serialBatch: { v, count }`. The "continue from last" toggle is in the same store.
6. **Multi-up (ups) labels:** serial is blocked with a short message (panel) and at the print gate. Not half-built.
7. **Resume cursor:** written after every confirmed label, with a hash of the design; if the design changed since the failure
   the app warns before resuming.
8. **validateConfig rejects** a custom alphabet with duplicate characters, fewer than 2 characters, or fewer than 2 left after
   excluded characters.
9. **Width-fit** uses the connected printer's DPI when one is connected (else 203) and is re-checked at the print gate.
10. **Numbers:** negative only if the user starts negative. **Batch:** max 5000, confirmation above 500. **ITF** with an odd digit
    count is an error with a one-tap fix (never silent padding). **Linked text** shows what the barcode encodes, including an
    appended check digit (the barcode is the root of the link). **Serial in Excel/bulk labels** uses the row index and hides
    Count, independent of per-label copies. **Print loop:** the inline loop stays; a cursor is added; printer-core's PrintQueue is not wired in.
11. Out of scope: date/time serials, sequences from a list, serial on multi-up.

## R1.2 Tracker (updated during the build)
- [ ] Step 1 Engine + tests (src/lib/serial)
- [ ] Step 2 Editor: panel, serial bar, preview (text, Counter/degrees, ArcText)
- [ ] Step 3 Barcode + QR: validation, width-fit, link, shortcut
- [ ] Step 4 Print: expansion, resolver, totals, progress, cancel, resume, continue
- [ ] Step 5 Table cells
- [ ] Step 6 Home entry via size screen
