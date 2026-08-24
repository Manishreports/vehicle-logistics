import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as XLSX from 'xlsx';

export function rowsToTSV(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows]
    .map((row) =>
      row.map((v) => String(v ?? '').replace(/\t/g, ' ')).join('\t')
    )
    .join('\n');
}

export function copyText(text: string): Promise<void> {
  return (
    navigator.clipboard?.writeText(text) ??
    Promise.reject(new Error('Clipboard unavailable'))
  );
}

export function downloadWorkbook(
  fileName: string,
  headers: string[],
  rows: unknown[][],
  sheetName = 'Report'
) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, fileName);
}

export async function downloadPdf(
  fileName: string,
  title: string,
  headers: string[],
  rows: unknown[][]
) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  let page = pdf.addPage();
  const { height } = page.getSize();

  let y = height - 40;

  page.drawText(title, {
    x: 30,
    y,
    size: 16,
    font,
  });

  y -= 24;

  const drawLine = (text: string, size = 7) => {
    if (y < 30) {
      page = pdf.addPage();
      y = height - 30;
    }

    page.drawText(text.slice(0, 170), {
      x: 30,
      y,
      size,
      font,
      color: rgb(0.15, 0.15, 0.15),
    });

    y -= 12;
  };

  drawLine(headers.join(' | '), 7);

  for (const row of rows) {
    drawLine(row.map((v) => String(v ?? '')).join(' | '));
  }

  const bytes = await pdf.save();

  // Convert Uint8Array to a standalone ArrayBuffer.
  // This avoids the TypeScript BlobPart / ArrayBufferLike
  // compatibility error with newer TypeScript versions.
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);

  const blob = new Blob([arrayBuffer], {
    type: 'application/pdf',
  });

  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();

  URL.revokeObjectURL(url);
}
