/**
 * In-app copy for iPhone printer availability.
 * JOSH uses LPAPI on iOS; TEJAS/RUDRA wait on a real Ninestar SDK; DEV is Android-only.
 *
 * Pure helpers (no react-native import) so Node unit tests can import this module.
 */
export type IosPrinterAvailability = {
  /** Short banner under the connect header. */
  banner: string;
  /** Empty-list copy when Bluetooth scan is unavailable in this build. */
  scanUnavailable: string;
  /** Whether TEJAS/RUDRA should show "coming soon on iPhone". */
  td404ComingSoon: boolean;
  /** Whether DEV/Veer is permanently Android-only. */
  devAndroidOnly: boolean;
};

export const IOS_PRINTER_AVAILABILITY: IosPrinterAvailability = {
  banner:
    'On iPhone, connect a JOSH printer over Bluetooth to print. TEJAS and RUDRA printing is coming next; DEV printers stay on Android.',
  scanUnavailable:
    'Install a Seznik iOS development build to scan and connect Bluetooth printers. Expo Go cannot load printer modules.',
  td404ComingSoon: true,
  devAndroidOnly: true,
};

/** Banner text when running on iOS; null on other platforms. */
export function iosPrinterConnectBanner(platform: string): string | null {
  if (platform !== 'ios') return null;
  return IOS_PRINTER_AVAILABILITY.banner;
}

/** Empty-state when canScan is false. */
export function printerScanUnavailableCopy(platform: string): string {
  if (platform === 'ios') return IOS_PRINTER_AVAILABILITY.scanUnavailable;
  if (platform === 'android') {
    return 'Build the Android app to list printers from phone Bluetooth.';
  }
  return 'Printer scanning is only available in the Android or iOS app.';
}
