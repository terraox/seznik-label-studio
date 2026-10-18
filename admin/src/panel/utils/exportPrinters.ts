import type { PrinterSummaryItem, PrinterUserLogRecord } from '../types/admin';

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function stamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function escapeCsv(value: string | number | null | undefined) {
  if (value == null) return '';
  const str = String(value);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function escapeXml(value: string | number | null | undefined) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatWhen(iso: string | null | undefined) {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    });
  } catch {
    return iso;
  }
}

// ─── Export View 1: Printer Frequency ──────────────────────────────────────────

export function exportPrinterFrequencyCsv(items: PrinterSummaryItem[], filenamePrefix = 'printer_frequency') {
  const header = ['Rank', 'Bluetooth Printer Name', 'Total Connections', 'Unique Users', 'Web Connections', 'Mobile Connections', 'Logged At (IST)'];
  const lines = [
    header.join(','),
    ...items.map((p, idx) =>
      [
        idx + 1,
        p.printerName,
        p.totalConnections,
        p.uniqueUsersCount,
        p.webCount,
        p.mobileCount,
        formatWhen(p.lastConnectedAt),
      ]
        .map(escapeCsv)
        .join(',')
    ),
  ];
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  downloadBlob(`${filenamePrefix}_${stamp()}.csv`, blob);
}

export function exportPrinterFrequencyExcel(items: PrinterSummaryItem[], filenamePrefix = 'printer_frequency') {
  const bodyRows = items
    .map(
      (p, idx) => `<Row>
        <Cell><Data ss:Type="Number">${idx + 1}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(p.printerName)}</Data></Cell>
        <Cell><Data ss:Type="Number">${p.totalConnections}</Data></Cell>
        <Cell><Data ss:Type="Number">${p.uniqueUsersCount}</Data></Cell>
        <Cell><Data ss:Type="Number">${p.webCount}</Data></Cell>
        <Cell><Data ss:Type="Number">${p.mobileCount}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(formatWhen(p.lastConnectedAt))}</Data></Cell>
      </Row>`
    )
    .join('');

  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Printer Frequency">
  <Table>
   <Row>
    <Cell><Data ss:Type="String">Rank</Data></Cell>
    <Cell><Data ss:Type="String">Bluetooth Printer Name</Data></Cell>
    <Cell><Data ss:Type="String">Total Connections</Data></Cell>
    <Cell><Data ss:Type="String">Unique Users</Data></Cell>
    <Cell><Data ss:Type="String">Web Connections</Data></Cell>
    <Cell><Data ss:Type="String">Mobile Connections</Data></Cell>
    <Cell><Data ss:Type="String">Logged At (IST)</Data></Cell>
   </Row>
   ${bodyRows}
  </Table>
 </Worksheet>
</Workbook>`;

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
  downloadBlob(`${filenamePrefix}_${stamp()}.xls`, blob);
}

// ─── Export View 2: User & Printer Logs ────────────────────────────────────────

export function exportPrinterUserLogsCsv(logs: PrinterUserLogRecord[], filenamePrefix = 'user_printer_logs') {
  const header = ['User Name', 'Business Name', 'Phone', 'Email', 'Plan', 'Bluetooth Printer Name', 'Device Address / MAC', 'Platform', 'Connection Type', 'Logged At (IST)'];
  const lines = [
    header.join(','),
    ...logs.map((l) =>
      [
        l.userName,
        l.businessName || '',
        l.userPhone || '',
        l.userEmail || '',
        l.userPlan,
        l.printerName,
        l.deviceAddress || '',
        l.platform,
        l.connectionType,
        formatWhen(l.createdAt),
      ]
        .map(escapeCsv)
        .join(',')
    ),
  ];
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  downloadBlob(`${filenamePrefix}_${stamp()}.csv`, blob);
}

export function exportPrinterUserLogsExcel(logs: PrinterUserLogRecord[], filenamePrefix = 'user_printer_logs') {
  const bodyRows = logs
    .map(
      (l) => `<Row>
        <Cell><Data ss:Type="String">${escapeXml(l.userName)}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(l.businessName || '')}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(l.userPhone || '')}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(l.userEmail || '')}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(l.userPlan)}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(l.printerName)}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(l.deviceAddress || '')}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(l.platform)}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(l.connectionType)}</Data></Cell>
        <Cell><Data ss:Type="String">${escapeXml(formatWhen(l.createdAt))}</Data></Cell>
      </Row>`
    )
    .join('');

  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="User Printer Logs">
  <Table>
   <Row>
    <Cell><Data ss:Type="String">User Name</Data></Cell>
    <Cell><Data ss:Type="String">Business Name</Data></Cell>
    <Cell><Data ss:Type="String">Phone</Data></Cell>
    <Cell><Data ss:Type="String">Email</Data></Cell>
    <Cell><Data ss:Type="String">Plan</Data></Cell>
    <Cell><Data ss:Type="String">Bluetooth Printer Name</Data></Cell>
    <Cell><Data ss:Type="String">Device Address / MAC</Data></Cell>
    <Cell><Data ss:Type="String">Platform</Data></Cell>
    <Cell><Data ss:Type="String">Connection Type</Data></Cell>
    <Cell><Data ss:Type="String">Logged At (IST)</Data></Cell>
   </Row>
   ${bodyRows}
  </Table>
 </Worksheet>
</Workbook>`;

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
  downloadBlob(`${filenamePrefix}_${stamp()}.xls`, blob);
}
