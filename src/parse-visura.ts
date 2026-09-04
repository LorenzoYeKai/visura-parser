import { extractPdf } from './internal/extract-pdf.js';
import {
  isSupportedVisuraBlock,
  parseExtractedDocument,
} from './internal/parse-document.js';
import { VisuraParseError } from './errors.js';
import type { ParseVisuraOptions, VisuraDocument } from './types.js';

export async function parseVisura(
  input: Uint8Array,
  options: ParseVisuraOptions = {},
): Promise<VisuraDocument> {
  const pdf = await extractPdf(input);
  const result = parseExtractedDocument(pdf, options.filename);

  if (result.reportType === undefined && !isSupportedVisuraBlock(pdf)) {
    throw new VisuraParseError(
      'unsupported-pdf',
      'The PDF is text-based but is not a recognized Visura camerale.',
    );
  }
  if (
    result.companyName === undefined &&
    result.taxCode === undefined &&
    result.reaNumber === undefined
  ) {
    throw new VisuraParseError(
      'malformed-content',
      'The Visura type was recognized, but no subject identity could be parsed.',
    );
  }

  return result;
}
