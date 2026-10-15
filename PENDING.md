# Pending

## Text box stretch should re-wrap like a label editor

**Status:** not started (parked 2026-10-15). Needs a concrete repro before changing code.

### What the user wants
- Dragging the text box wider or narrower must re-wrap the words to the new width.
- Only an explicit Enter (hard newline the user typed) keeps a line break. Soft wraps must never be stored in the text.
- Live while dragging: no lag, no flicker, same result as after release. Behave like a label editor text box.

### What is wrong today (user report)
- Both widening and narrowing "retain the format": the line breaks do not follow the new width.
- Happens during the drag and after release.
- The user's description was cut off at "make behaviour like a …"; ask them to finish it.

### Findings so far
- `computeWrappedLines` (`src/lib/text-metrics.ts`) re-wraps correctly by width in isolation (15 / 30 / 60 mm gave 7 / 3 / 2 lines).
- Text resize is width-only (`src/lib/editor/resize-policy.ts`, `case 'text'`), the `e` handle recomputes the height from the wrapped lines (`src/components/editor/konva-transformer.tsx`, around line 720).
- Resting text renders `visibleWrappedLines` and live drag swaps in a native-wrapped copy (`liveReflowSv`, `useReflowSwapStyles`, `src/components/editor/element-renderer.tsx`). The two use different measurers (Skia `matchFont` vs the native Text), so the lines can differ and cause a snap or flicker on release.
- Lines React Native reports are cached per width in `rememberVisibleLines` / `remembered` (`src/lib/visible-text-layout.ts`) and reused for print.
- No code found that bakes soft wraps into `element.text`.
- `SkiaText` (`src/components/editor/skia-element-renderer.tsx`) only splits on `\n` and does not wrap, but it is used only by the dev screen `dev-skia-test.tsx`.
- If the text panel's wrap option is set to `Close`, wrapping is off entirely (`formatTextForRender` joins lines and truncates), which would look exactly like this bug.

### To find out first
1. Which element and which wrap option (Word / Char / Close) when it happens.
2. Exact text, whether it contains Enter, and what is seen versus expected.
3. Whether the live drag and the released state differ.

### Likely fix direction
- Make the live drag and the resting render use one wrapping source so there is no swap flicker.
- Keep only hard newlines from the typed text; derive soft wraps from width every time.
- Check print uses the same lines (`src/printing/raster/skia-rasterizer.ts`, `drawText`).

### Related files
- `src/components/editor/konva-transformer.tsx`
- `src/components/editor/element-renderer.tsx`
- `src/lib/visible-text-layout.ts`
- `src/lib/text-metrics.ts`
- `src/lib/editor/resize-policy.ts`
