import type { ShareCapital } from '../types.js';
import type { ExtractedPage, ExtractedPdf, PositionedSpan } from './model.js';
import {
  foldText,
  normalizeText,
  semanticSpans,
  spansInReadingOrder,
} from './text.js';
import { parseItalianAmount } from './values.js';

type CapitalAmountKey = 'authorized' | 'subscribed' | 'paidUp';

const CAPITAL_KEYS: Readonly<Record<string, CapitalAmountKey>> = {
  deliberato: 'authorized',
  sottoscritto: 'subscribed',
  versato: 'paidUp',
};

const CAPITAL_HEADING = /^capitale sociale in euro$/i;
const HEADING_LINE =
  /^(?:capitale sociale(?: in(?: euro)?)?|in euro|euro)(?:\s+|$)/i;
const CAPITAL_ROW =
  /^(deliberato|sottoscritto|versato)\s*:?\s*((?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?|-|n\.d\.)?$/i;

function readTable(
  page: ExtractedPage,
  heading: PositionedSpan,
): ShareCapital | undefined {
  const rows: PositionedSpan[][] = [];
  for (const span of spansInReadingOrder(page)) {
    if (span.y > heading.y + 2) continue;
    const row = rows.at(-1);
    if (row !== undefined && Math.abs((row[0]?.y ?? span.y) - span.y) <= 2) {
      row.push(span);
    } else {
      rows.push([span]);
    }
  }

  const result: ShareCapital = { currency: 'EUR' };
  const seen = new Set<CapitalAmountKey>();
  let previousY = heading.y;
  for (const row of rows) {
    const first = row[0];
    if (first === undefined) continue;
    // The observed table has consecutive rows. A gap or unrelated row ends it;
    // later shareholder payments must never supply a missing company amount.
    if (previousY - first.y > Math.max(heading.height, first.height) * 3) break;
    previousY = first.y;
    let text = normalizeText(
      row
        .sort((left, right) => left.x - right.x)
        .map((span) => span.text)
        .join(' '),
    );
    if (heading.y - first.y <= heading.height * 2) {
      text = text.replace(HEADING_LINE, '').trim();
    }
    if (text.length === 0) continue;

    const match = CAPITAL_ROW.exec(text);
    const label = match?.[1];
    if (label === undefined) break;
    const key = CAPITAL_KEYS[foldText(label)];
    if (key === undefined || seen.has(key)) break;
    seen.add(key);
    const amount = match?.[2];
    if (amount !== undefined) {
      const parsedAmount = parseItalianAmount(amount);
      if (parsedAmount !== undefined) result[key] = parsedAmount;
    }
  }
  return seen.size === 0 ? undefined : result;
}

/** Reads only the current-state euro capital table, never cover or quota amounts. */
export function parseCapital(pdf: ExtractedPdf): ShareCapital | undefined {
  for (const page of pdf.pages) {
    const headings = semanticSpans(page)
      .filter((span) => CAPITAL_HEADING.test(normalizeText(span.text)))
      .sort((left, right) => right.y - left.y || left.x - right.x);
    for (const heading of headings) {
      const capital = readTable(page, heading);
      if (capital !== undefined) return capital;
    }
  }
  return undefined;
}
