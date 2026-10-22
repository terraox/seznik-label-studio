import { notFound } from 'next/navigation';

import { PrinterNamesDesk } from '@/components/printer-names-desk';
import { PRINTER_LINES, printerLineLabel, type PrinterLineId } from '@/lib/printer-line';

export const metadata = { title: 'Bluetooth names' };

export default async function PrinterNamesPage({ params }: { params: Promise<{ line: string }> }) {
  const { line } = await params;
  if (!PRINTER_LINES.some((l) => l.id === line) && line !== 'other') notFound();
  return <PrinterNamesDesk line={line} label={printerLineLabel(line as PrinterLineId)} />;
}
