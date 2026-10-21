# Printer offsets

Every fixed offset used when placing borders and elements, with the date the current value
was noted. Values are millimetres. Positive x is right, positive y is down. Update the row
and its date whenever a value changes.

The user can also add offsets on the Print page ("Elements offset", "Border offset", H/V
offset). Those are added on top of the fixed values below and are not listed here.

## Josh (DP27, LPAPI)

| Offset | Value | Noted | Where |
| --- | --- | --- | --- |
| Border shift (own layer, ignores element and user offsets) | x 0.6, y -1 | 2026-10-21 | `JOSH_BORDER_SHIFT_MM`, `src/lib/printer/josh-print.ts` |
| Elements extra rightward move (borders do not use it) | x 3 | 2026-10-12 | `JOSH_ELEMENT_X_OFFSET_MM`, `src/lib/printer/josh-print.ts` |
| LPAPI draw bias (baked into the bitmap) | x -1, y -1 | 2026-10-12 | `JOSH_LPAPI_DRAW_BIAS_H_MM` / `_V_MM`, `src/lib/printer/josh-print.ts` |
| Media origin | x 0 | 2026-10-12 | `JOSH_MEDIA_ORIGIN_H_MM`, `src/lib/printer/print-spec.ts` |
| Border stroke centre from the die-cut edge | 3 | 2026-10-12 | `JOSH_BORDER_CENTER_GAP_MM`, `src/lib/printer/josh-print.ts` |

History:
- 2026-10-21: border shift x moved from 2.6 to 0.6 (2 mm left). Elements unchanged.
- 2026-10-12: border shift 2.6 and element offset 3 set (`b4e7e6b`).

## TD-404 Tejas

| Offset | Value | Noted | Where |
| --- | --- | --- | --- |
| Element shift | x 0, y 2 | 2026-10-14 | `TD404_ELEMENT_SHIFT_H_MM` / `_V_MM`, `src/lib/printer/print-spec.ts` |
| Die-cut centre offset | x 0.25, y 1 | 2026-10-13 | `TD404_DIECUT_CENTER_OFFSET_MM`, `src/lib/printer/print-spec.ts` |
| Border shift (own layer) | x 0, y 0 | 2026-10-13 | `TD404_BORDER_SHIFT_MM`, `src/lib/printer/print-spec.ts` |
| Border gap | 2 | 2026-10-13 | `TD404_BORDER_GAP_MM`, `src/lib/printer/print-spec.ts` |
| Media origin | x 0 | 2026-10-13 | `TD404_MEDIA_ORIGIN_H_MM`, `src/lib/printer/print-spec.ts` |

## TD-404 Rudra

| Offset | Value | Noted | Where |
| --- | --- | --- | --- |
| Element shift | x 0, y -1 | 2026-10-18 | `RUDRA_ELEMENT_SHIFT_MM`, `src/lib/printer/print-spec.ts` |
| Die-cut centre offset | x -0.25, y -1 | 2026-10-17 | `RUDRA_DIECUT_CENTER_OFFSET_MM`, `src/lib/printer/print-spec.ts` |

Dates are the commit date of the last change to the value, read from git on 2026-10-21.
