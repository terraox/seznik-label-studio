# Excel flow and per-row copies

Per-row copies are in the app. The count comes from one numeric sheet column the user picks on Data Column. **From reading source.**

## Excel path

Path:

1. **Print Excel** (`src/app/excel-print.tsx`) — pick label size, pick the file.
2. **Parse** (`src/lib/excel.ts`, `src/lib/excel-cells.ts`, `src/lib/excel-rows.ts`) — every sheet tab becomes a string grid. A row that is empty in every cell is dropped. Hidden or filtered Excel rows are still imported.
3. **Data File** (`src/app/excel-data-preview.tsx`) — read-only table. Search only hides rows on screen. Confirm keeps the whole sheet.
4. **Data Column** (`src/app/excel-bulk-setup.tsx`) — for each column: include it or not, and mark it text, barcode, or QR. Header names only guess that kind (`guessBulkSlotKind` in `src/lib/bulk-labels.ts`: names like SKU become barcode, QR becomes QR, everything else is text). Confirm saves **one** label with `doc.bulk` and opens the editor.
5. **Editor** — pager walks every data row (`src/components/bulk-label-nav.tsx`).
6. **Print** — one raster per data row that has copies greater than 0. The print screen stepper for an Excel label is **Multiply all counts**.

## How the copies column is chosen

There is no required column name, and there is no place to type a count in the app.

On Data Column, the **Copies column** picker lists **None** and only columns whose cells are numbers (blanks are allowed; a name column is not listed). Auto-guess runs when the screen opens and again when the user switches sheet tabs. A header is pre-selected when it matches, ignoring case, and that column is numeric:

`copies`, `qty`, `quantity`, `pcs`, `count`

That is only a starting choice. The user can pick a different column, or **None**.

- **A column is selected** — each row’s count is that cell, read from the live sheet when printing (not a saved list of numbers).
- **None** — every row prints once. The print-screen stepper can still multiply that (see below).

The chosen column is turned off in the text / barcode / QR row. That row is greyed out and is not printed on the label.

### How a cell becomes a count

| Cell | Count | Warning on Data Column? |
|------|-------|-------------------------|
| blank or spaces | 1 | no |
| `0` | skip that row | no |
| negative | 0 (skip) | yes |
| text or not a number | 1 | yes |
| decimal (`2.9`) | whole number below it (`2`) | no, unless it also hits the cap |
| above 99 | 99 | yes |

Caps live in one place: 99 per row, 500 physical labels for the whole job (after multiply).

If every row is 0, Print does nothing and shows a message.

The print screen does not add a per-row box. For an Excel bulk label the existing stepper is renamed **Multiply all counts**. It multiplies each row’s count. Example: cells `1, 3, 0, blank, 2` and multiply 1 prints **7** labels (row 1 once, row 2 three times, row 3 skipped, blank once, row 5 twice). Multiply 2 prints **14**. The editor pager still shows all 5 rows. A normal (non-Excel) label keeps the stepper named **Number of Copies**.

### When the column is read again

- Confirm on Data Column saves **which column** (`copiesColumnIndex`), not the numbers.
- Changing the picker, or switching sheet tabs, points at the new column (tabs also re-run auto-guess).
- Re-importing the file replaces the stored workbook. After the user goes through Data Column again and confirms, print uses the new cells.

Known gap, not part of this work: re-import gives the file a new id. An old label still pointing at the previous id will not see the new sheet until the user imports onto that label again.
