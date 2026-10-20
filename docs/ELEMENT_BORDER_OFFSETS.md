# Elements offset and Border offset (Print page)

Built 2026-10-20. TD-404 (Tejas and Rudra) and Josh only. Dev is not covered (see Not done).

## What it does

Two user offsets on the Print page, under Advanced Settings, each with X and Y in **mm**
(+X right, +Y down, same frame as the existing Horizontal / Vertical Offset):

- **Elements offset** moves everything except the border (text, images, barcodes, shapes).
- **Border offset** moves only the border. Disabled when the label has no border; no border
  offset is applied then.

They **add** to the baked-in offsets, default 0 / 0, so a label that never set them prints as before.
Step 0.5 mm, range -10..10 mm. Saved on the label (`LabelDocument.settings`), per label.

## Where the old baked-in offsets live (unchanged)

| Bridge | Elements | Border |
|---|---|---|
| TD-404 | `td404ContentShiftMm/Dots` in `src/lib/printer/print-spec.ts`: Print-page H/V plus fixed shift (Tejas 0,+2 mm; Rudra 0,-1 mm), passed as `shiftDots` | Own layer: `td404BorderOuterDots`, `TD404_DIECUT_CENTER_OFFSET_MM` / `RUDRA_DIECUT_CENTER_OFFSET_MM`, `TD404_BORDER_SHIFT_MM`; via `td404EdgeBorderOptions` |
| Josh | `joshHeadlessRasterOptions` in `src/lib/printer/josh-print.ts`: H/V + LPAPI bias (-1,-1 mm) + `JOSH_ELEMENT_X_OFFSET_MM` (+3 mm) | Own layer: `JOSH_BORDER_SHIFT_MM` (2.6,-1) |
| Dev | none baked in; native `hOffsetMm`/`vOffsetMm` move the whole captured bitmap | same, moves with everything |

## What changed

- `src/lib/layer-offsets.ts` (new): offset types, `layerOffsetsOf` (missing = 0), border detection,
  `effectiveLayerOffsets` (no border -> no border offset), `offsetToPaperFrame` (rotated TD-404),
  `previewWithLayerOffsets`, `layerOffsetWarning`.
- `src/lib/label-settings.ts`: `elementsOffsetXMm/YMm`, `borderOffsetXMm/YMm` (default 0; old labels resolve to 0).
- `src/lib/printer/print-spec.ts`: `td404ContentShiftDots`, `td404UserShiftDots` take an optional elements offset;
  `td404EdgeBorderOptions` takes an optional border offset. Each is converted to dots on its own and added to the existing value.
- `src/lib/printer/josh-print.ts`: `joshHeadlessRasterOptions` takes optional `{ elements, border }`.
- `src/app/print.tsx`: state, steppers, unit text, warning, saving to the label, preview, and the TD-404 / Josh raster calls.
- `src/printing/raster/__tests__/layer-offsets.test.ts` (new).

Native/Kotlin and the rasterizer are untouched: the rasterizer already drew the border as its own layer.

## Behaviour notes

- **Label size and cropping:** offsets shift dots inside the same bitmap; size is unchanged. Ink pushed past the edge is
  cut (existing `shiftGray` behaviour). A warning shows when the user's offset makes elements or the border go past the edge. It still prints.
  The warning is a box check, not a pixel check.
- **Preview:** the on-screen preview draws the user offsets in (element and border positions moved by the mm values).
  It never showed the baked offsets, and still does not.
- **Rotated TD-404:** elements offset is in the label frame (like the existing offset); border offset is turned into the paper frame.
- **Excel bulk and copies:** one offset set per label, read from the label and used for every row and copy (same raster call).
- **Unsupported cases:** the controls are disabled for labels the headless raster cannot draw (photos, tables, signatures),
  for Josh at a rotation other than 0°, and the border offset when the border is not its own layer
  (rotated border element; Josh on non-rectangular die-cut).
- Test sheets, photo/image-mode prints and PDF prints do not use these offsets.

## Verification

Verified by running:
- Raster output with offsets at 0/0 is byte-identical before vs after the change (SHA-1 of gray and mono buffers, TD-404, TD-404 rotated 90, Josh; 50x30 and 50x50; with and without border; with and without an H/V offset).
- `layer-offsets.test.ts` passes: border offset changes only border pixels and elements offset only element pixels (TD-404, TD-404 rotated, Josh); 0/0 equals the old call; label model, preview and warning checks.
- Existing `josh-edge-border`, `td404-edge-border`, `td404-rotated-raster` tests pass.
- Typecheck shows no errors in the touched files; lint shows no errors in the new files.

From reading source only:
- Wiring in `print.tsx` (state, saving, UI, bulk path, rotated mapping), the preview, and the warning thresholds.
- The Dev SHA-1 print hash covers the capture path only, so it was not used; TD-404 and Josh do not go through it.

Not verified:
- Any device print. Test on a TD-404 and a Josh: offsets 0/0 (should look as before), then border-only and elements-only moves.
- `print-offset.test.ts` fails on "border bottom edge moves" (it expects the border to move with the page shift). It does not use the code changed here (no edge-border layer), and outputs of that path are unchanged, so it looks like an existing failure; I did not confirm it on a clean checkout.
- Repo-wide `tsc` and lint already report errors elsewhere (for example in `print.tsx` text with unescaped quotes).

## Not done

- **Dev:** needs a decision. Dev prints a screen capture with the border inside it, so the two layers can't be split without Kotlin changes or a headless path that changes today's output.
