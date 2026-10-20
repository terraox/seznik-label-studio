# Auto Offset Calibration Plan

> Status: PLAN ONLY (2026-10-20). Nothing built.

## Goal

Let a user find correct **border** and **element** offsets without guessing. Border and elements get separate H and V offsets (4 numbers per printer model + paper size).

## Method

Print a **calibration label** with known marks. Two ways to read it:

1. **Manual tick entry** (accurate ~0.1 mm, no CV). User picks the tick that lines up.
2. **Photo auto-read** (~±0.2–0.3 mm). App measures the photo and fills the same four values. User confirms.

Build manual first. Photo is optional and fills the same fields.

## Calibration label

All positions in dots, known in code.

- 4 fiducial marks (solid squares / crosshairs) near the corners of the border box. Give scale and flattening.
- Border rectangle at its nominal position.
- Crosshair at each element anchor (text / barcode / image zones).
- **Border rulers:** numbered ticks −N…+N, step 0.25 mm, on each edge, read against the **paper edge**.
- **Element rulers:** same ticks around an element crosshair, read against the **border**.
- Printer model + paper size printed small on the label (so a photo is self-identifying).

## Offset model

```
Offsets { borderH, borderV, elementH, elementV }   // mm
```

- Stored per printer model (Tejas, Rudra, Josh, Dev) and paper size.
- Border offset: measured vs paper edge.
- Element offset: measured vs border, so a bad border does not leak into it.
- **Open question:** are elements positioned relative to the border or the paper in the current code? If relative to the border, final = base + borderOffset + elementOffset. If relative to the paper, do not add borderOffset. Check before step 2.
- Fits the planned `td404-offsets.ts` (see `TD404_BRIDGE_SPLIT_PLAN.md` step 4); other printers get an equivalent file. No printer numbers in shared code.

## Steps

| # | Step | Notes |
|---|------|-------|
| 1 | Check how border and element offsets are applied today (`print-spec.ts`, `td404-job-params.ts`, `border-calibration.ts`, `calibration-print.tsx`, `calibration-dots.tsx`, `hOffsetMm`/`vOffsetMm` in `modules/dev-printer/src/types.ts`) | Settles the open question |
| 2 | Split offsets into border vs element, per model + paper size | JS only, rebuild not needed |
| 3 | Calibration label generator (marks, border, crosshairs, rulers) | Reuse existing calibration screens |
| 4 | Manual entry screen: pick tick per ruler, convert to mm, save | Rebuild not needed |
| 5 | Reprint verify: print a normal label with new offsets, user confirms | |
| 6 | Backend photo endpoint (OpenCV): detect fiducials + paper edges, homography, return the four offsets + confidence | Backend, not in Expo |
| 7 | App photo flow: overlay guide, reject blurry / tilted / glare, upload, show suggested values, user confirms | Falls back to step 4 on low confidence |
| 8 | Average 2–3 labels per run to cancel gap-sensor noise | |
| 9 | Detect rotation / skew / feed drift and warn (offsets cannot fix it) | |

## Photo capture rules

- Flat, dark matte surface, top-down, even light, no glare on thermal paper.
- Whole label + all 4 fiducials in frame.
- Do not use an LLM's vision for the numbers. Classic CV only.

## Risks

- Gap sensor stops at a slightly different spot each label → average several.
- Low contrast between label and backing breaks paper-edge detection → fallback to manual.
- Rotation / skew is not an offset problem.
- Each printer model differs, so calibrate per model and never share numbers.

## Done when

- Manual path gives correct border and element H/V on a Tejas label and a Rudra label.
- Photo path within ±0.3 mm of the manual result on the same label.
- Reprint verify passes on device.
