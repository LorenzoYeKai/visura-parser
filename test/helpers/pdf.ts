interface PdfText {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly size?: number;
}

function escapePdfString(value: string): string {
  return value.replace(/([\\()])/g, '\\$1');
}

export function makeTextPdf(items: readonly PdfText[]): Uint8Array {
  const stream = items
    .map(
      ({ text, x, y, size = 10 }) =>
        `BT /F1 ${String(size)} Tf ${String(x)} ${String(y)} Td (${escapePdfString(text)}) Tj ET`,
    )
    .join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${String(new TextEncoder().encode(stream).byteLength)} >>\nstream\n${stream}\nendstream`,
  ];

  let document = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(new TextEncoder().encode(document).byteLength);
    document += `${String(index + 1)} 0 obj\n${object}\nendobj\n`;
  }

  const xrefOffset = new TextEncoder().encode(document).byteLength;
  const xref = offsets
    .map((offset, index) =>
      index === 0
        ? '0000000000 65535 f '
        : `${String(offset).padStart(10, '0')} 00000 n `,
    )
    .join('\n');
  document += `xref\n0 ${String(offsets.length)}\n${xref}\ntrailer\n<< /Size ${String(offsets.length)} /Root 1 0 R >>\nstartxref\n${String(xrefOffset)}\n%%EOF\n`;

  return new TextEncoder().encode(document);
}
