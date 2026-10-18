## Text Element Resize: Auto-width / Fixed-width Model (Plan Only, Do Not Implement Yet)

Attached: reference screenshots (selected box with handle, a box mid-drag, a
wrapped box). Produce a PLAN, then stop for review. Do not write code yet.

### Step 0: report the current state first (read code, no changes)
- How the Text element stores width/height today, and which handles it shows.
- How text wraps in the editor (Konva) versus the print/export path (headless
  Skia), and whether both use the same measuring code. Name the files.
- How the existing "Auto Wrapping (Close / Char / Word)", "Vertical Display",
  Char Spacing, Line Spacing and Hor Alignment settings feed into layout.
- Which other element types (Counter, ArcText, etc.) share this resize path.
Locate files yourself. Do not assume paths.

### Project rules that apply (do not break)
- The live editor stays on Konva. Print/export is the separate Skia rasterizer.
- Origin never moves during resize. The left/top at gesture start stay fixed.
  No clamp in the resize path may write a different left/top.
- Live preview and final commit must call the same function with the same
  inputs (atomic UI-thread settle). No separate "settle" reconciliation.
- Do not regress: tap-and-drag lag fix (handle mounting must not block gesture
  start), vertical-resize jitter fix, double-tap quick-edit, multi-select
  toggle behavior.

### Locked spec (implement exactly this)

**Two modes**
- Auto-width (default): a new box, or any box never dragged, sizes to its text.
  Typing widens it. Enter makes a new line. No wrapping.
- Fixed-width: the first drag of the right handle switches the box to this mode.
  The width is stored and text wraps at that width.
- In fixed-width mode, editing text does not change the width; the text wraps.
- The switch is one-way. It never returns to auto-width on its own, even if the
  width equals the text width. A "reset to auto width" menu action may come later.

**Handle**
- One handle, right edge, vertical middle. No other handles.
- Fixed on-screen size, thumb-sized touch area.
- Text is edited in a separate popup, so handle behavior while typing is out of
  scope.

**Dragging right:** wider box, text not scaled, font size unchanged, wrapped text
unwraps live.

**Dragging left:** while the text fits, nothing changes. When the next word no
longer fits, it wraps live with no lag, flicker or blank text. Dragging back out
undoes the wrap the same way. The same width always gives the same layout; it must
not depend on drag history.

**Alignment and anchor:** left-aligned text. The left edge stays fixed; only the
right edge moves.

**Text content**
- Enter makes a manual line break; each line wraps separately.
- Nothing typed is ever dropped (emoji, barcode numbers, very long unbroken
  strings).
- A word wider than the box breaks by character so none of it is hidden. Never
  clip.
- Minimum width: one character of the current font. Maximum width: the label edge.

**Height:** automatic, follows the number of lines. No vertical handle. If the
text is taller than the label it may overflow and the editor shows a warning.

**Font size:** changes only from the menu. Changing it re-wraps at the current
width and never changes the width.

**Live behavior and performance**
- Layout is recalculated on every move event using the same text-measuring code
  as the print path.
- Nothing is saved to the document store per move event. The final width is saved
  once on finger lift, as one undo step.

**Print match:** the printed label must wrap at exactly the same points as the
editor. Test: shrink a box until the text wraps into 3 lines, print, compare line
breaks.

### Reference note
In the reference screenshots (WePrint), a narrow box clips overflowing text at a
fixed height. Our spec deliberately differs: height grows with the line count and
text is never clipped. Do not copy the clipping.

### Questions the plan must answer (do not decide silently)
1. **Existing saved labels:** how are text elements that already exist
   migrated? Recommend treating any element with a stored width as fixed-width, so
   saved labels do not reflow or change when printed. Confirm.
2. **Existing settings:** the panel already has Auto Wrapping (Close/Char/Word),
   Vertical Display and Hor Alignment. How do they interact with the new model?
   Propose one coherent rule for each, and say which become obsolete.
3. **Auto-width at the label edge:** when typing makes the box reach the label
   edge, what happens? Propose behavior (for example clamp and wrap without
   flipping the stored mode) and justify it.
4. **Measuring on every move event:** how is text measured per frame without a
   JS-thread round trip causing lag? Say where measurement runs (UI-thread
   worklet vs JS) and how live and commit use the identical function.
5. **Shared measurer:** how editor and print are guaranteed to use one pure
   function of (text, font, size, char spacing, width), and where it lives.
6. **Other element types** that share this resize path: which are affected, and
   how they are protected from regression.

### What the plan must contain
1. Current-state report from Step 0.
2. Data model change (for example an optional stored width, where absent means
   auto-width) and the migration.
3. The shared pure layout function and its inputs/outputs.
4. Live drag path versus commit path, showing they are the same call, plus the
   single undo step.
5. Test plan: unit tests for the layout function (same width gives same layout
   regardless of history, character-break for over-wide words, emoji and long
   unbroken strings never dropped, minimum width) and an editor-vs-print line-break
   parity test.
6. Phased order, each phase shippable alone (for example: shared layout function
   and parity test, then auto-width, then handle and fixed-width, then migration,
   then font-size and edge cases).
7. Risks, and all open questions together at the end.

Verification will be done by the user on a physical device through Expo. Do not
use an emulator, adb or screenshot capture. When implementation is approved later,
report real on-device logs for the wrap breakpoints during a drag, not a summary
claim of "works".

Do not begin implementation. Stop after the plan.

### Drag behavior: reuse the existing element resize gesture
The right-handle drag must behave exactly like drag-resize on the other
elements (same gesture handling, same responsiveness, same handle mounting,
same live-preview and single commit on release). That part is already solved
and verified in this project. Do not build a new gesture system for Text.
Plug the Text element into the existing resize path and change only what is
specific to Text: width instead of scale, and live re-wrapping through the
shared layout function.
