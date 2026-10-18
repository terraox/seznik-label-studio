# New Label Page Revamp: Plan

Status: **plan only, nothing implemented.** Stop here for review.

Notes on how this was written:
- Step 0 is from reading the code. No file was changed to produce it.
- The screenshot of the current page was not visible to me, so the "current layout" below is read from `src/app/new-label-setup.tsx`, not from the picture. If the picture shows something the code does not, tell me.
- APIs are checked against `package.json` (Expo ~54, expo-router ~6, React Native 0.81, react-native-keyboard-controller 1.18.5), not `AGENTS.md`.

## Tracker

- [x] Phase 1: tappable size fields, "Create Label" button, collapsible presets, live preview
- [x] Phase 2: Rectangle | Circle and diameter
- [x] Phase 3: Labels across (1 to 6), gap, total width, printer-width warning
- [x] Phase 4: polish (a11y, dark-mode token check, edge cases)

---

## 1. Step 0: current state

### 1.1 The screen and every way into it

The screen is `src/app/new-label-setup.tsx` (789 lines), registered in `src/app/_layout.tsx:185` with a slide-from-right animation. It is one file with all state local to it.

| Entry point | Route params it passes | What it expects |
|---|---|---|
| Home "2-Up Label" (`src/components/home/home-tools.ts:30`, tested in `home-tools.test.ts:20`) | `?isTwoUps=true` | Columns = 2, gap 0 mm, name "2ups label", header "2ups label" |
| Home "Custom Size" and `/customize-template` (`src/app/customize-template.tsx:10`) | `focusSize=1`, `isSingleCanvas=true` | Width dialog opens at once, single label only (multi-up section hidden) |
| `/new-label` "Customize Size" | goes to `/customize-template`, which forwards as above | same |
| `/new-label` "Import Image" (`new-label.tsx:83`) | `importImageUri`, `importImageWidth`, `importImageHeight`, `isSingleCanvas=true` | Image label: preview shows the image, button reads "Open in Editor", doc is built here with the image already placed |
| `/new-label` (line 53) | `isSingleCanvas=true` | Single label |
| `/jewellery-label` (`jewellery-label.tsx:64`) | image params plus `defaultWidth`, `defaultHeight`, `isSingleCanvas=true`, `isJewelleryTag=true` | Image label with jewellery tag defaults and die-cut body rules |
| `/scan` (`scan.tsx:135`) | image params, `isSingleCanvas=true` | Image label from a photo |
| Editor "More" menu "New" (`more-menu.tsx:52`) | none | Plain page: 1 label, 50 x 30 |

Parameters the screen also reads but **no caller in `src/` sends today**: `isClone`, `cloneFromId`, `cloneName`, `cloneWidth`, `cloneHeight`, `isJewellery3Up`. They are live code paths (clone naming, element rescale, 3-up jewellery defaults) but currently unreachable except by a deep link. They must keep working in code even if nothing opens them.

Where the first button goes, three ways (`handleCreateLabel`, lines 111 to 262):
1. **Image import:** builds the document here (image element, contain-fit, optional jewellery category), saves it, opens `/edit` with `labelId`.
2. **Columns > 1:** builds the document with `createUpsConfig` and `doc.ups`, sets `templateCategory = 'Multi-UP'`, saves it, opens `/edit` with `labelId`.
3. **Single label:** does not create a document. It opens `/edit` with `labelName`, `labelWidth`, `labelHeight`, `orientation`, `paperType`, optional `cloneFromId`; `edit.tsx` builds the document (lines 616 to 700).

### 1.2 How the document stores size, shape and multi-up

From `src/lib/label-document.ts`:
- **Size:** `widthMm` and `heightMm` on `LabelDocument`. Millimetres on the physical stock, never pixels.
- **Shape:** `mediaShape?: 'rectangle' | 'roundedRectangle' | 'circle' | 'ellipse' | 'diecut'`. **Circle already exists.** Absent means rectangle. A circle is just `mediaShape = 'circle'` with `widthMm === heightMm` (the circle industry templates set it in `template-documents.ts:413`). It is used for: editor preview clipping (`mediaShapeClipStyle` in `label-geometry.ts:311`, `edit.tsx:4145`), border shape (`print/raster/border-shapes.ts`), and the print rasteriser (`skia-rasterizer.ts:212,297`, `print-border.ts`). The printer still receives a rectangular bitmap; the shape clips ink and corners.
- **Multi-up:** `doc.ups?: { columns, columnSpacingMm, batchEdit, activeIndex, panels[][] }`. Each panel is one label of `widthMm x heightMm`; the editor edits one panel at a time. **2-Up exists. 3-Up and 4-Up exist** (`createUpsConfig` clamps columns to 2..4; the editor shows tabs from 3 columns, a pager for 2). N-up beyond 4 is not possible without raising that clamp.
- **Print and export:** `composeUpsDocument` (`label-document.ts:375`) flattens the panels into one document: `totalWidth = max(cell, cell x columns + gap x (columns - 1))`, height = cell height, each panel's elements shifted by `i x (cell + gap)`. `print.tsx:514` calls it. Negative gaps are allowed (stick calibration).
- **Important for circle:** `composeUpsDocument` spreads the source document, so `mediaShape` is **kept on the combined strip**. A circle with several columns would clip the whole strip as one big circle or ellipse. That is a broken label, not a supported combination (see 4.4).

Limits already in the code (`label-geometry.ts`): `MIN_LABEL_MM = 8`, `MAX_LABEL_MM = 310`, `clampLabelMm` (rounds to 0.01), `validateLabelSize`, `parseSizeInput` (accepts a comma, returns null for non-positive or non-numeric), `matchingPresetId`, and `LABEL_SIZE_PRESETS` (18 presets including jewellery sheets).

### 1.3 The current layout, top to bottom

1. Header with back chevron and a title (varies by mode).
2. **Preview pad:** N grey boxes at the right aspect, a hint line. For 1 label the hint is the "Phone pad stays the same size. Label canvas: W x H mm" note; for several, "Each panel is ... Print strip ~ ...".
3. **Size presets** section: a "Size format" card that explains "Width x Height mm" (a card that only describes how to read the chips), then a 2-column grid of 6 hard-coded chips (50x25, 50x50, 50x30, 50x75, 50x15, 100x150), then "Browse our templates".
4. **Custom size** card: Label name row (opens an alert-style modal), Width row and Height row (each opens `LabelDimensionModal`, which also holds a mm / cm / in unit switch).
5. **Multi-up layout** card (hidden when `isSingleCanvas`): stepper for columns (1 to 4), gap stepper (-4 to 8 mm, steps of 0.5), "Batch edit" switch.
6. Sticky bottom button "New" (image mode: "Open in Editor").

The "Size format" card and the "Phone pad" note are explanation only. They carry no state.

### 1.4 Printer maximum printable width

Defined in `src/printer-core/profiles.json` (`maxWidthMm`, from head dots and DPI), read through `src/printer-core/profiles.ts` (`getProfile`, `resolveProfile`, `fitToHead`):

| Model | Max width |
|---|---|
| DEV-7299, GD985, GENERIC-203-48 | 48 mm |
| JOSH-LP50 | 50 mm |
| TD-404-203, GENERIC-203-104 | 104 mm |
| TD-404 (304 dpi), TEZ-108 | 108 mm |

There is no single global maximum; it depends on the connected printer, and no printer may be connected while creating a label. The editor already allows labels up to 310 mm wide.

---

## 2. Components

### 2.1 Reused as they are
- `themedStyles`, `useThemeRefresh`, `C` from `@/theme` (the page already uses them; `new-label-setup.tsx` is in `src/theme/__tests__/theme-files.ts`, so the no-hardcoded-colors test covers it). `Spacing` from `@/constants/theme`.
- `FormScrollView` (`src/components/ui/form-scroll-view.tsx`, a keyboard-aware scroll view on `react-native-keyboard-controller`) for the scrolling body.
- `TextInput` from `@/components/ui/text-input` for the numeric and name fields.
- `IosAlertModal` is no longer needed for the name (inline field instead); keep it imported only if something else on the page uses it.
- `LABEL_SIZE_PRESETS`, `matchingPresetId`, `parseSizeInput`, `clampLabelMm`, `validateLabelSize`, `fromMm`, `toMm` from `label-geometry.ts`.
- `createUpsConfig`, `createLabelDocument`, `composeUpsDocument` from `label-document.ts`.
- `AppIcon` for chevrons.
- The existing "Browse our templates" row and its route `/(tabs)/template`.

### 2.2 New, small, local to the page (put in `src/components/new-label/`)
| Component | Job |
|---|---|
| `LabelPreview` | Draws the shape (rectangle, circle) or N cells with the gap, and the "50 mm" / "30 mm" edge labels. Pure View drawing, fitted to a max box. |
| `SegmentedControl` | Rectangle / Circle. No shared one exists in `src/components` (searched), so a 2-option control, generic over options so it can be reused. |
| `NumberField` | Label, numeric input, unit text "mm", inline error text, selects all on focus. Holds its own text while editing. |
| `StepperRow` | `-`, value, `+`, plus quick chips. Reuses the page's existing stepper styling. |
| `CollapsibleBar` | Header row with title, current value and chevron; shows children when open. The existing `ui/collapsible.tsx` is the Expo template one (themed text, fixed look), not suitable, so a small new one. |
| `StickyCreateBar` | Bottom bar with the primary button. |

### 2.3 Removed from the page
- The "Size format" card and the "Phone pad stays the same size" note.
- `LabelDimensionModal` and the unit switch (mm / cm / in). **Open question Q3:** the new brief says mm fields only. Dropping cm / in is a feature removal.
- The separate "Custom size" and "Multi-up layout" cards (replaced by the sections in section 3).

---

## 3. State model

Everything lives in one small reducer-style hook, `useNewLabelForm`, with the pure logic in `src/lib/new-label-form.ts` so it can be tested in node.

```ts
type Shape = 'rectangle' | 'circle';

type FormState = {
  shape: Shape;
  columns: number;          // 1..MAX_COLUMNS
  width: string;            // text as typed, mm
  height: string;
  diameter: string;
  gap: string;              // mm, signed
  name: string;
  batchEdit: boolean;       // kept: existing behaviour for columns > 1
  // remembered while the user switches shape, never shown
  lastRect: { width: string; height: string };
  lastDiameter: string;
};
```

Fields are stored as the typed strings and parsed on read, so "5." or an empty field never snaps to something else while typing, and the value survives the keyboard closing. A derived `parsed` object gives numbers or `null` per field.

### 3.1 Limits and validation (proposed)
| Field | Min | Max | Why |
|---|---|---|---|
| Width, Height, Diameter | 8 mm | 310 mm | Existing `MIN_LABEL_MM` / `MAX_LABEL_MM`, so every saved label and the editor stay valid. |
| Labels across | 1 | 6 | See 3.2. |
| Gap | -4 mm | 20 mm | The current stepper allows -4 to 8 (negative for stick calibration); 20 gives room for wide die-cut gaps. Compose already handles any value. |
| Name | 1 character after trim | 60 | Empty name falls back to "Default label" on Create, with the field showing the placeholder. |

Messages (inline, under the field): "Enter a number", "Minimum is 8 mm", "Maximum is 310 mm", "Gap must be between -4 and 20 mm". The comma is accepted and shown as typed; parsing uses `parseSizeInput` rules. Out-of-range values are **rejected with a message, not silently clamped** while typing; on blur they stay visible and the field stays marked, and Create stays disabled. (Q4 asks whether to clamp on blur instead.)

### 3.2 Maximum labels across
Proposed **6**. Reasoning:
- The widest head is 108 mm (3.1) and the smallest allowed label is 8 mm, so a 6-up of 15 mm labels is 90 mm plus gaps and fits real stock; beyond 6 the cells become too small to edit on a phone and the editor's panel tabs get crowded.
- The existing clamp is 4 (`createUpsConfig`). Raising it to 6 is a one-line change in `label-document.ts`, plus checking the editor tab strip (it already switches to tabs from 3 columns) and the jewellery 3-up helpers (they compare `columns === 3`, unaffected).
- Total width above the connected printer's maximum **warns, never blocks** (Q2).

### 3.3 Derived values (pure functions, tested)
- `cellSize(state)`: rectangle gives `{w: width, h: height}`; circle gives `{w: d, h: d}`.
- `totalWidthMm(cellW, columns, gap) = round2(max(cellW, cellW x columns + gap x (columns - 1)))`. Same formula as `composeUpsDocument`, so the page and print agree.
- `presetMatch(w, h)`: `matchingPresetId` plus a flag. Circles never match a rectangle preset; the header shows "Custom" for circle.
- `widthWarning(total, printerMaxMm | null)`: returns text or null.
- `validate(state)`: per-field errors and an overall `canCreate`.
- `switchShape(state, next)`: rectangle to circle sets `diameter = min(width, height)` (if the user has not typed a diameter before) and stores `lastRect`; circle to rectangle restores `lastRect`. Typing never loses the other shape's values.

### 3.4 Mapping onto document creation
| Case | Result |
|---|---|
| Rectangle, 1 column | Unchanged route: `/edit` with `labelName`, `labelWidth`, `labelHeight`, `orientation`, `paperType` (plus `cloneFromId`). |
| Rectangle, columns > 1 | Unchanged: `createUpsConfig` + `createLabelDocument` with `doc.ups` and `templateCategory = 'Multi-UP'`, saved, `/edit?labelId`. Cell size is the label size. |
| Circle, 1 column | **Needs one addition** (see Q1): the document must carry `mediaShape: 'circle'` and `widthMm === heightMm`. Preferred: add an optional `mediaShape` route param consumed where `edit.tsx` creates a document from params (small, keeps the single-label path the same). Alternative: build and save the document here like the multi-up path. |
| Circle, columns > 1 | Not supported by the model (4.4). Disabled with an explanation. |
| Image import | Unchanged. Shape control and columns are hidden (these labels are `isSingleCanvas`). |

The document model is not changed except (a) the `createUpsConfig` column clamp 4 to 6 and (b) possibly passing `mediaShape` through the edit route.

---

## 4. Entry-point parameters on the new page

| Param | New behaviour |
|---|---|
| `isTwoUps=true` | Labels across starts at 2; gap defaults to **0 mm** (the existing 2-up default, a stick kiss-cut gutter); name defaults to "2ups label". Shape stays Rectangle. |
| `focusSize=1` | Focus and select the first size field (Width, or Diameter if circle); scroll it into view once after layout, not on every render. Replaces the width dialog that opens today. |
| `isSingleCanvas=true` | Same meaning: single label, hide Labels across, gap and total width. Shape control stays available (a single circle label is fine). |
| Image import params | Unchanged: preview shows the image on the canvas, shape and columns hidden, button reads "Open in Editor" (not "Create Label"), `isJewelleryTag` rules for die-cut and category unchanged. |
| `defaultWidth`, `defaultHeight` | Initial width and height. |
| `isClone`, `cloneName`, `cloneWidth`, `cloneHeight`, `cloneFromId` | Same initial values and same rescale of seed elements. Header "Label Clone" kept. |
| `isJewellery3Up` | Same: columns 3, gap 3 mm, tag size; the unreachable-today path keeps its defaults. |
| none (More menu) | 1 label, Rectangle, 50 x 30, name "Default label". |

The header title logic stays; the primary button reads **"Create Label"** (image mode keeps "Open in Editor").

### 4.4 Circle with Labels across > 1
**Not supported by the current model, so it is disabled, not faked.** `composeUpsDocument` keeps `mediaShape` on the whole strip, and the editor and rasteriser clip that whole strip as one circle or ellipse. Behaviour on the page:
- Choosing Circle sets Labels across to 1 and disables the stepper and chips, with a short line: "Circle labels print one at a time."
- Choosing Labels across > 1 while on Circle is blocked the same way (the Circle option in the control is disabled with that line while columns > 1; the user switches to 1 first).
Supporting it later needs a per-cell shape (for example `ups.cellMediaShape`) applied by compose, the editor preview and the rasteriser. That is a bigger change in print code and is listed as a possible Phase 5, not part of this plan.

---

## 5. Keyboard and scrolling

- Body: `FormScrollView` (already in the project, built on `react-native-keyboard-controller`'s `KeyboardAwareScrollView`) with `keyboardShouldPersistTaps="handled"` and `bottomOffset` large enough to clear the sticky bar. It scrolls the focused field into view as the keyboard opens.
- Sticky button: a bottom bar outside the scroll view. It must stay above the keyboard, so wrap it with the keyboard controller's `KeyboardStickyView` (same library, `pdf.tsx` already imports `KeyboardAvoidingView` from it) offset by the safe-area inset. If that proves flaky on a device, fall back to `KeyboardAvoidingView` from the same library with `behavior="padding"`. **To verify on device.**
- Numeric fields: `keyboardType="decimal-pad"` (on iOS this has no minus key, so the gap field uses `numbers-and-punctuation`; Android's decimal-pad has no minus either, so Q5 asks how to enter a negative gap). Comma accepted. `returnKeyType="next"` moves between fields; the last one is "done".
- Values live in the form state as text, so closing the keyboard, scrolling or collapsing a section never resets a field.
- The live preview sits at the top inside the scroll view (not pinned), so it scrolls away on small screens when the keyboard is open. Optionally pin a compact preview above the keyboard (Q6).

---

## 6. Tests (pure, node, `tsx --test`)

New script `test:new-label` in `package.json`, file `src/lib/__tests__/new-label-form.test.ts`:
- `parse`: "50", "50.5", "50,5", "", ".", "abc", "-3", "5." results.
- `validate`: min / max edges for width, height, diameter (7.99, 8, 310, 310.01); gap edges; empty name; overall `canCreate`.
- `totalWidthMm`: 1, 2, 3, 6 columns, zero gap, positive gap, negative gap, matches `composeUpsDocument` output width for the same inputs (build a doc with `createUpsConfig` + compose and compare).
- `presetMatch`: exact preset, within 0.15 mm, outside, circle.
- `switchShape`: rectangle to circle takes the smaller side; circle back restores the rectangle; typed diameter kept across a round trip; width / height never lost.
- `widthWarning`: below, equal, above the printer max; `null` max gives no warning.
- Entry params: `initialStateFromParams` for each row of the table in section 4 (two-up, focusSize, singleCanvas, defaults, clone, jewellery 3-up).
- `createUpsConfig` accepts 6 columns and clamps 7 to 6.
- Regression: `home-tools.test.ts` (route string `/new-label-setup?isTwoUps=true` unchanged) and `test:theme` (no hard-coded colours in the new files; add the new component files to `theme-files.ts`).

On-device (the user runs these through Expo; no emulator, adb or screenshots): the fields, keyboard behaviour, sticky button and focus scrolling cannot be unit-tested. Logs: the form logs once, in `__DEV__`, the final `{shape, columns, width, height, diameter, gap}` at Create and the route it took.

---

## 7. Phases (each shippable alone)

**Phase 1: fields, Create Label, presets**
- Inline `NumberField` for Width and Height (mm), name field, live `LabelPreview` (rectangle only, with edge labels), collapsible preset bar (collapsed, header shows matching preset or "Custom", preset grid uses `LABEL_SIZE_PRESETS` subset), "Create Label" sticky button disabled until valid, inline errors.
- Remove the Size format card and the Phone pad note and the dimension modals. Keep the existing Multi-up card for now so 2-up keeps working unchanged.
- Entry points: `focusSize` focuses Width; all params keep working.

**Phase 2: shape and diameter**
- Rectangle | Circle control, Diameter field, preview draws the circle, shape switching rules, route/param for `mediaShape: 'circle'` (Q1), Create for a single circle label. Verify on device that the circle renders as it did before (solid stroke, transparent corners, correct spacing).

**Phase 3: Labels across, gap, total width**
- Replace the old Multi-up card with the stepper (1 to 6) and chips 1, 2, 3, gap field, read-only total width line, printer-width warning, circle-disabled rule, `createUpsConfig` clamp to 6, "Size of each label" title, `isTwoUps` preselect. Batch edit switch stays.

**Phase 4: polish**
- Accessibility labels and roles, error announcements, 44 pt touch targets, dark-mode token review (no hex colours), small-screen layout, tests for any gaps found on device.

(A later Phase 5, only if wanted: per-cell circle for multi-up.)

---

## 8. Risks

1. **Circle plus multi-up** would silently clip the whole strip (section 1.2). Mitigated by disabling the combination.
2. **Sticky button above the keyboard** with the keyboard controller library is the most device-dependent part; fallback described in section 5.
3. **Dropping the unit switch** (cm / in) removes a feature (Q3).
4. **Raising columns to 6** touches the editor panel tabs and the compose path; compose and print are generic in `columns`, but the tab strip layout for 5 and 6 is untested.
5. **`edit.tsx` is large and edited by others**; the circle route param must be a minimal addition.
6. **Printer width unknown** when no printer is connected, so the warning can only say "exceeds the connected printer" when there is one (Q2).
7. **Negative gap entry** on a decimal keyboard (Q5).
8. **Unreachable params** (`isClone`, `isJewellery3Up`, clone sizes) have no caller to test through; covered by pure tests only.
9. **Preset header sync** compares to 0.15 mm (existing rule); a typed 50.1 x 30 would show 50 x 30.

---

## 9. Open questions

1. **Circle on a single label:** add an optional `mediaShape` route param consumed in `edit.tsx`'s document creation (recommended, smallest change), or build and save the document in the setup screen like the multi-up path does (which saves an empty label even if the user backs out)?
2. **Printer width warning:** use the connected printer's profile only, or also a fixed fallback (for example 108 mm) when none is connected? Recommended: connected printer only, silent otherwise.
3. **Units:** drop mm / cm / in (the brief says mm fields) or keep a small unit switch?
4. **Out-of-range values:** reject with a message and keep the text (recommended) or clamp on blur?
5. **Negative gap:** do we still need it (stick calibration)? Decimal keyboards cannot type a minus. Options: allow only 0 and above on the page (the gap can still be made negative later in the editor), or add a small "-" toggle next to the field.
6. **Preview position:** scroll away with the page (simplest) or pin a compact preview while the keyboard is open?
7. **Max labels across:** 6 as proposed, or keep 4 and avoid touching the editor tabs?
8. **Batch edit switch:** keep it under the new Labels across section (current behaviour), or drop it from setup?
9. **Preset list in the bar:** the 6 current chips, or the fuller `LABEL_SIZE_PRESETS` list (18, includes jewellery die-cut sheets that set odd widths)? Presets that imply columns (the 2-up and 3-up jewellery sheets) would set Labels across; recommended to leave those out of this page.
10. **Screenshot:** please confirm the current page matches the description in 1.3, since I could not see the picture.

---

## Verification (for the later build)

The user tests on a physical device through Expo. No emulator, adb or screenshot capture. Each phase will report `npx tsc --noEmit` (baseline today has pre-existing errors; the report will show no new ones), full test output including `test:new-label`, `test:theme` and `home-tools`, the changed files, and anything unsure. Rebuild versus refresh will be stated: this plan needs **no native rebuild** (JS only), unless the keyboard-controller sticky view proves to need one, which is not expected since the library is already installed.

---

## Revision 1: answers to the open questions (added at the bottom; earlier sections not rewritten)

This revision wins over anything above that disagrees with it.

1. **Q1, single circle label:** add the optional `mediaShape` route param to the editor (`edit.tsx` document creation). The setup page does not build and save the label for this case, so backing out leaves no empty label.
2. **Q3, units:** mm only. The cm / in switch and `LabelDimensionModal` are dropped. (Reversible: if sizes are entered in inches, keep a small unit switch instead.)
3. **Q5, negative gap:** the gap field has − and + buttons in 0.5 mm steps over **-4 to 20 mm**, and typing is allowed from 0 up. The decimal keyboard never needs a minus key, and stick-calibration gaps stay reachable with the buttons.
4. **Q7, max labels across:** 6. Phase 3 must test the editor's tab strip with 5 and 6 columns on a device. If it breaks, cap at 4 and report back.
5. **`isSingleCanvas` correction.** Section 4 said `isSingleCanvas` hides Labels across, gap and total width. That is wrong for the page this plan is for: **Custom Size sets `isSingleCanvas=true`** (via `/customize-template`), so with that rule Custom Size would get the shape control but never 2-up or 3-up. Corrected rule: **Labels across, gap and total width are hidden only for image-import labels** (`importImageUri` present, including the jewellery-tag and scan routes). For every other route, including `isSingleCanvas=true` from Custom Size and `/new-label`, the shape control and Labels across are shown. `isSingleCanvas` keeps only these meanings: it does not preselect 2-up, and `isTwoUps` is still ignored when it is set unless it is explicitly sent (an `isTwoUps` + `isSingleCanvas` pair is not sent by any caller today). This is my reading of the correction; the brief's "isSingleCanvas keeps its current meaning" conflicts with it, so confirm.
6. Phase 1 stays as written, except the old Multi-up card is now shown for all non-image routes (as today it is hidden when `isSingleCanvas`), so Custom Size gains Labels across in Phase 1 already.

**Not yet received:** the "combined approval message" with seven corrections. Only the isSingleCanvas correction and the four answers above reached me, in the pasted note. The other six corrections are not in this plan. Nothing has been implemented.

## Revision 2: all four phases built in one go (code and tests done; waiting on the phone)

- Built on the Revision 1 answers. Files: `src/lib/new-label-form.ts` (pure logic), `src/lib/__tests__/new-label-form.test.ts` (14 tests, `npm run test:new-label`), `src/components/new-label/new-label-parts.tsx` (preview, segmented control, number field, stepper, collapsible bar), `src/app/new-label-setup.tsx` (rewritten), `src/app/edit.tsx` (optional `mediaShape` route param, circle only), `src/lib/label-document.ts` (`createUpsConfig` clamp 4 to 6), `src/theme/__tests__/theme-files.ts`, `package.json`.
- Choices made where the plan left room: presets are 9 chips (the old 6 plus 100x100, 60x40, 40x30); the gap field shows − / + buttons plus a typed field that takes 0 and up (a negative gap is shown as empty in the typed field and is changed with the buttons); errors show after the user leaves a field or presses Create Label; the circle option is disabled while Labels across is above 1, and Labels across + is disabled while Circle is selected.
- Not verified on a device: keyboard behaviour and the sticky button (`KeyboardStickyView`), focus scroll for `focusSize`, the editor tab strip with 5 and 6 columns, circle rendering of a new circle label (solid stroke, transparent corners).
- Revision log: 1 initial plan, 2 answers (Revision 1), 3 build (this entry).
