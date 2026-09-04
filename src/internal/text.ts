import type { ExtractedPage, PositionedSpan } from './model.js';

export function normalizeText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function foldText(value: string): string {
  return normalizeText(value).toLowerCase();
}

export function unique(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = normalizeText(value);
    const key = foldText(normalized);
    if (normalized.length === 0 || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }

  return result;
}

export function spansInReadingOrder(page: ExtractedPage): PositionedSpan[] {
  return [...page.spans].sort((left, right) => {
    const rowDifference = right.y - left.y;
    if (Math.abs(rowDifference) > 2) return rowDifference;
    return left.x - right.x;
  });
}

/**
 * Adds deterministic same-line phrases for PDFs that split one printed label
 * into several text items. Original spans are retained for value lookup.
 */
export function semanticSpans(page: ExtractedPage): PositionedSpan[] {
  const original = spansInReadingOrder(page);
  const rows: PositionedSpan[][] = [];

  for (const span of original) {
    const row = rows.find(
      (candidate) => Math.abs((candidate[0]?.y ?? span.y) - span.y) <= 2,
    );
    if (row === undefined) rows.push([span]);
    else row.push(span);
  }

  const phrases: PositionedSpan[] = [...original];
  for (const row of rows) {
    row.sort((left, right) => left.x - right.x);
    for (let start = 0; start < row.length; start += 1) {
      const first = row[start];
      if (first === undefined) continue;
      let text = first.text;
      let right = first.x + first.width;

      for (
        let end = start + 1;
        end < Math.min(row.length, start + 7);
        end += 1
      ) {
        const next = row[end];
        if (next === undefined || next.x - right > 18) break;
        text = `${text} ${next.text}`;
        right = Math.max(right, next.x + next.width);
        phrases.push({
          ...first,
          text: normalizeText(text),
          width: right - first.x,
          height: Math.max(first.height, next.height),
          hasEol: next.hasEol,
        });
      }
    }
  }

  for (const first of original) {
    let previous = first;
    let text = first.text;
    let width = first.width;
    for (let depth = 0; depth < 2; depth += 1) {
      const next = original.find(
        (span) =>
          Math.abs(span.x - first.x) <= 3 &&
          previous.y - span.y > 3 &&
          previous.y - span.y <= 18,
      );
      if (next === undefined) break;
      text = `${text} ${next.text}`;
      width = Math.max(width, next.width);
      phrases.push({
        ...first,
        text: normalizeText(text),
        width,
        hasEol: next.hasEol,
      });
      previous = next;
    }
  }

  return phrases;
}

export function pageText(page: ExtractedPage): string {
  return spansInReadingOrder(page)
    .map((span) => span.text)
    .join('\n');
}
