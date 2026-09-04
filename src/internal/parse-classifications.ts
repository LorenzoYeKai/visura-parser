import type { AtecoClassification } from '../types.js';
import type { ExtractedPdf } from './model.js';
import { normalizeText, semanticSpans, spansInReadingOrder } from './text.js';

/** Codes are read only inside an explicitly labelled ATECO/ATECORI block. */
export function parseClassifications(pdf: ExtractedPdf): AtecoClassification[] {
  const result: AtecoClassification[] = [];
  for (const page of pdf.pages) {
    const spans = spansInReadingOrder(page);
    const headings = semanticSpans(page).filter((span) =>
      /^(?:classificazione(?: dell'attivit[aà]'?)?\s+)?ateco(?:ri)?\b/i.test(
        normalizeText(span.text),
      ),
    );
    for (const heading of headings) {
      let current: AtecoClassification | undefined;
      let previousY = heading.y;
      for (const span of spans.filter((span) => span.y < heading.y - 2)) {
        const text = normalizeText(span.text);
        if (
          /^(?:\d+\s+)?(?:classificazione|attivit[aà]'?|albi|licenze|soci|amministratori|sede|capitale|addetti|codice nace)\b/i.test(
            text,
          ) ||
          previousY - span.y > 45
        )
          break;
        previousY = span.y;
        const code =
          /^(?:codice\s*:?\s*)?(\d{2}(?:\.\d{1,2}){0,2})(?:\s*[-–:]\s*(.+))?$/i.exec(
            text,
          );
        if (code?.[1]) {
          current = { code: code[1] };
          if (code[2]) current.description = code[2];
          result.push(current);
        } else if (current !== undefined) {
          const importance = /^importanza\s*:\s*(.+)$/i.exec(text);
          if (importance?.[1]) current.importance = importance[1];
          else if (/^(?:prevalente|primaria|secondaria)$/i.test(text))
            current.importance = text;
          else if (/^fonte\b/i.test(text)) continue;
          else if (/^[a-zà-ù]/i.test(text))
            current.description = normalizeText(
              `${current.description ?? ''} ${text.replace(/^descrizione\s*:\s*/i, '')}`,
            );
        }
      }
    }
  }
  return result.filter(
    (item, index) =>
      result.findIndex(
        (other) => JSON.stringify(other) === JSON.stringify(item),
      ) === index,
  );
}
