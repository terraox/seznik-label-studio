import type { AccessCodeRecord } from '../types/admin';

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

function escapeCsv(value: string) {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function rowsFromCodes(codes: AccessCodeRecord[]) {
  return codes.map((c, index) => ({
    serial: String(index + 1),
    code: c.code,
    batchId: c.batchId,
    note: c.note || '',
    createdBy: c.createdBy || '',
    createdAt: c.createdAt,
  }));
}

export function exportAccessCodesCsv(codes: AccessCodeRecord[], filenamePrefix = 'access-codes') {
  const rows = rowsFromCodes(codes);
  const header = ['Serial', 'Code', 'Batch ID', 'Shipment Name', 'Created By', 'Created At'];
  const lines = [
    header.join(','),
    ...rows.map((r) =>
      [r.serial, r.code, r.batchId, r.note, r.createdBy, r.createdAt].map(escapeCsv).join(',')
    ),
  ];
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  downloadBlob(`${filenamePrefix}_${stamp()}.csv`, blob);
}

/** Excel-compatible SpreadsheetML (.xls) — opens natively in Excel without extra deps. */
export function exportAccessCodesExcel(codes: AccessCodeRecord[], filenamePrefix = 'access-codes') {
  const bodyRows = codes
    .map((c) => `<Row><Cell><Data ss:Type="String">${escapeXml(c.code)}</Data></Cell></Row>`)
    .join('');

  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Access Codes">
  <Table>
   <Row><Cell><Data ss:Type="String">Code</Data></Cell></Row>
   ${bodyRows}
  </Table>
 </Worksheet>
</Workbook>`;

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
  downloadBlob(`${filenamePrefix}_${stamp()}.xls`, blob);
}

/** Opens a print-ready document so the admin can Save as PDF from the browser. */
export function exportAccessCodesPdf(codes: AccessCodeRecord[], title = 'Seznik Access Codes') {
  const tableRows = codes
    .map(
      (c) => `<tr>
      <td style="font-family:ui-monospace,monospace;letter-spacing:0.08em;font-weight:700">${escapeHtml(c.code)}</td>
    </tr>`
    )
    .join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 28px; color: #111; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    p { margin: 0 0 16px; color: #555; font-size: 12px; }
    table { width: auto; min-width: 160px; border-collapse: collapse; font-size: 13px; }
    th, td { border: 1px solid #d1d5db; padding: 8px 14px; text-align: left; }
    th { background: #f3f4f6; font-weight: 700; }
    @media print { button { display: none !important; } body { padding: 0; } }
  </style>
</head>
<body>
  <button onclick="window.print()" style="margin-bottom:16px;padding:8px 14px;border:1px solid #cbd5e1;border-radius:8px;background:#2563eb;color:#fff;font-weight:600;cursor:pointer">Print / Save as PDF</button>
  <h1>${escapeHtml(title)}</h1>
  <p>${codes.length} unique 7-character codes · Generated ${escapeHtml(new Date().toLocaleString('en-IN'))}</p>
  <table>
    <thead>
      <tr><th>Code</th></tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 250); };</script>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) {
    throw new Error('Pop-up blocked. Allow pop-ups to export PDF.');
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
