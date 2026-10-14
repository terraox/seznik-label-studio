/** Shown on the Google Drive option when the picked file is a spreadsheet. */
export const DRIVE_SPREADSHEET_LABEL = 'Google Drive (Sheets, Excel)';

export const MANUAL_EXPORT_STEPS =
  'Or export it first: open the Sheet in Google Sheets, tap File > Download > Microsoft Excel (.xlsx), then choose This Device and pick the downloaded file.';

/** Messages from the native Google Sheets export (expo-document-picker patch). */
const SHEET_EXPORT_ERRORS = [
  'Google Drive did not return a spreadsheet',
  'This Google Sheet could not be downloaded',
  'This app cannot read that Google Sheet',
  'This Google Sheet is too large',
];

export function isSheetExportError(message: string): boolean {
  return SHEET_EXPORT_ERRORS.some((known) => message.includes(known));
}

/** Append the manual-export steps to a Google Sheets export failure; other messages pass through. */
export function withManualExportHint(message: string): string {
  return isSheetExportError(message) ? `${message}\n\n${MANUAL_EXPORT_STEPS}` : message;
}
