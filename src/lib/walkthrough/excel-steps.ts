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
    title: 'How many labels per row',
    body: 'Pick "1 each" to print every row once. If your sheet has a column with numbers, such as Qty, pick it and each row prints that many labels. Rows with a blank or 0 are skipped.',
  },
  {
    id: 'columns',
    target: 'excel.columns',
    scrolls: true,
    title: 'What goes on the label',
    body: 'Tick a column and mark it as text, a barcode, or a QR code. Confirm opens the editor so you can check each row before printing.',
  },
];
