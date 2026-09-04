import {
  getDocument,
  InvalidPDFException,
} from 'pdfjs-dist/legacy/build/pdf.mjs';

import { VisuraParseError } from '../errors.js';
import type { ExtractedPage, ExtractedPdf, PositionedSpan } from './model.js';

const PDF_SIGNATURE = '%PDF-';
const MAX_INPUT_BYTES = 50 * 1024 * 1024;
const MAX_PAGES = 200;
const MAX_SPANS = 250_000;
const MAX_CHARACTERS = 10_000_000;

interface PdfJsTextItem {
  readonly str: string;
  readonly transform: unknown[];
  readonly width: number;
  readonly height: number;
  readonly fontName: string;
  readonly hasEOL: boolean;
}

function hasPdfSignature(bytes: Uint8Array): boolean {
  if (bytes.byteLength < PDF_SIGNATURE.length) return false;

  for (let index = 0; index < PDF_SIGNATURE.length; index += 1) {
    if (bytes[index] !== PDF_SIGNATURE.charCodeAt(index)) return false;
  }

  return true;
}

function isTextItem(item: unknown): item is PdfJsTextItem {
  return (
    typeof item === 'object' &&
    item !== null &&
    'str' in item &&
    typeof item.str === 'string' &&
    'transform' in item &&
    Array.isArray(item.transform)
  );
}

function toSpan(item: PdfJsTextItem, page: number): PositionedSpan | undefined {
  const text = item.str.trim();
  if (text.length === 0) return undefined;

  const x = Number(item.transform[4]);
  const y = Number(item.transform[5]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;

  return {
    page,
    text,
    x,
    y,
    width: item.width,
    height: item.height,
    fontName: item.fontName,
    hasEol: item.hasEOL,
  };
}

export async function extractPdf(bytes: Uint8Array): Promise<ExtractedPdf> {
  if (bytes.byteLength > MAX_INPUT_BYTES) {
    throw new VisuraParseError(
      'resource-limit',
      'The PDF exceeds the supported input size.',
    );
  }
  if (!hasPdfSignature(bytes)) {
    throw new VisuraParseError(
      'invalid-pdf',
      'Input does not have a PDF signature.',
    );
  }

  const loadingTask = getDocument({
    data: bytes.slice(),
    isEvalSupported: false,
    useWorkerFetch: false,
    verbosity: 0,
  });

  try {
    const document = await loadingTask.promise;
    if (document.numPages > MAX_PAGES) {
      throw new VisuraParseError(
        'resource-limit',
        'The PDF exceeds the supported page count.',
      );
    }
    const pages: ExtractedPage[] = [];
    let spanCount = 0;
    let characterCount = 0;

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent({
        includeMarkedContent: false,
      });
      const spans: PositionedSpan[] = [];
      for (const item of content.items) {
        if (!isTextItem(item)) continue;
        const span = toSpan(item, pageNumber);
        if (span !== undefined) {
          spans.push(span);
          spanCount += 1;
          characterCount += span.text.length;
        }
        if (spanCount > MAX_SPANS || characterCount > MAX_CHARACTERS) {
          throw new VisuraParseError(
            'resource-limit',
            'The PDF exceeds the supported text size.',
          );
        }
      }

      pages.push({
        number: pageNumber,
        width: viewport.width,
        height: viewport.height,
        spans,
      });
    }

    if (!pages.some((page) => page.spans.length > 0)) {
      throw new VisuraParseError(
        'text-unavailable',
        'The PDF contains no extractable text on any page.',
      );
    }

    return { pages };
  } catch (error) {
    if (error instanceof VisuraParseError) throw error;
    if (error instanceof Error && error.name === 'PasswordException') {
      throw new VisuraParseError(
        'password-required',
        'The PDF requires a password and cannot be parsed.',
        { cause: error },
      );
    }
    if (error instanceof InvalidPDFException) {
      throw new VisuraParseError(
        'invalid-pdf',
        'The PDF is invalid or truncated.',
        {
          cause: error,
        },
      );
    }

    throw new VisuraParseError(
      'malformed-content',
      'The PDF could not be interpreted safely.',
      { cause: error },
    );
  } finally {
    await loadingTask.destroy();
  }
}
