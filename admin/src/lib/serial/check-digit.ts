// The app's barcode encoder imports this as '@/lib/serial/check-digit'. In the admin '@/' is admin/src,
// so this re-export lets the sample designer use the app's own encoder unchanged.
export * from '../../../../src/lib/serial/check-digit';
