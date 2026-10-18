import type { WalkthroughStep } from '@/lib/walkthrough/home-steps';

/** First visit to Print Excel (size and file). Replay from the ? button on that screen. */
export const EXCEL_WALKTHROUGH: readonly WalkthroughStep[] = [
  {
    id: 'welcome',
    title: 'Print labels from Excel',
    body: 'Set the label the same way as a blank label, then pick your spreadsheet. You can open this tour again from the ? button.',
  },
  {
    id: 'size',
    target: 'excel.size',
    scrolls: true,
    title: 'Set the label',
    body: 'Choose the shape, how many labels sit across, and the size. Every row of the sheet uses this label.',
  },
  {
    id: 'continue',
    target: 'excel.continue',
    title: 'Choose the spreadsheet',
    body: 'Continue opens your file. You then see the rows and, on the next page, which columns print and how many copies each row gets.',
  },
];

/** First visit to Data Column, where copies are chosen. Replay from the ? on that screen. */
export const EXCEL_COLUMNS_WALKTHROUGH: readonly WalkthroughStep[] = [
  {
    id: 'welcome',
    title: 'Columns and label count',
    body: 'This page decides what goes on the label and how many labels each row makes. Open it again from the ? button.',
  },
  {
    id: 'copies',
    target: 'excel.copies',
    scrolls: true,
    title: 'Quantity column',
    body: 'Optional. Tap a number column (like Qty) to print that many labels per row, tap it again to clear. Blank or 0 rows are skipped. Without one, set copies when printing.',
  },
  {
    id: 'columns',
    target: 'excel.columns',
    scrolls: true,
    title: 'What goes on the label',
    body: 'Tick a column and mark it as text, a barcode, or a QR code. Confirm opens the editor so you can check each row before printing.',
  },
];
