import type { LocalUnit } from '../types.js';
import type { ExtractedPdf, PositionedSpan } from './model.js';
import { joinPages } from './join-pages.js';
import { normalizeText, spansInReadingOrder } from './text.js';
import { parseItalianDate } from './values.js';

interface Row {
  readonly x: number;
  readonly y: number;
  readonly text: string;
}

const LOCAL_UNIT_HEADING =
  /^unit[aà]'? locale n\.?\s*([a-z]{2})\s*\/\s*(\d+)\b/i;
const SECTION_HEADING = /^\d+\s+\D/u;
const ADDRESS_LABEL = /^indirizzo\b\s*:?[\s]*/i;
const ACTIVITY_LABEL = /^attivit[aà]'? esercitata\b\s*:?[\s]*/i;
const FIELD_OR_BLOCK_LABEL =
  /^(?:data (?:di )?apertura|indirizzo|estremi di iscrizione|numero repertorio economico amministrativo|attivit[aà]'? (?:secondaria )?esercitata|classificazione ateco(?:ri)?|denuncia attivit[aà]'?|licenze\/?autorizzazioni|tipo)\b/i;

function rowsFromSpans(spans: readonly PositionedSpan[]): Row[] {
  const rows: PositionedSpan[][] = [];
  for (const span of spansInReadingOrder({
    number: 1,
    width: 595,
    height: 842,
    spans,
  })) {
    const row = rows.at(-1);
    if (row !== undefined && Math.abs((row[0]?.y ?? span.y) - span.y) <= 2) {
      row.push(span);
    } else {
      rows.push([span]);
    }
  }

  return rows.map((row) => {
    row.sort((left, right) => left.x - right.x);
    return {
      x: row[0]?.x ?? 0,
      y: row[0]?.y ?? 0,
      text: normalizeText(row.map((span) => span.text).join(' ')),
    };
  });
}

function multilineValue(
  rows: readonly Row[],
  label: RegExp,
): string | undefined {
  const index = rows.findIndex((row) => label.test(row.text));
  if (index < 0) return undefined;

  const parts: string[] = [];
  const first = rows[index];
  if (first !== undefined) {
    const inline = normalizeText(first.text.replace(label, ''));
    if (inline.length > 0) parts.push(inline);
  }
  for (const row of rows.slice(index + 1)) {
    if (FIELD_OR_BLOCK_LABEL.test(row.text)) break;
    parts.push(row.text);
  }
  const value = normalizeText(parts.join(' '));
  return value.length === 0 ? undefined : value;
}

function inlineValue(rows: readonly Row[], label: RegExp): string | undefined {
  for (const row of rows) {
    const match = label.exec(row.text);
    const value = match?.[1];
    if (value !== undefined) return normalizeText(value);
  }
  return undefined;
}

/** Parses current local-unit records and keeps their printed source order. */
export function parseLocalUnits(pdf: ExtractedPdf): LocalUnit[] {
  const page = joinPages(pdf.pages);
  const rows = rowsFromSpans(page.spans);
  const starts = rows
    .map((row, index) => ({
      index,
      row,
      match: LOCAL_UNIT_HEADING.exec(row.text),
    }))
    .filter(
      (entry): entry is typeof entry & { match: RegExpExecArray } =>
        entry.match !== null && entry.row.x < page.width * 0.1,
    );
  const result: LocalUnit[] = [];

  for (const [position, start] of starts.entries()) {
    const nextRecord = starts[position + 1]?.index ?? rows.length;
    const nextSection = rows.findIndex(
      (row, index) =>
        index > start.index &&
        index < nextRecord &&
        row.x < page.width * 0.15 &&
        SECTION_HEADING.test(row.text),
    );
    const end = nextSection < 0 ? nextRecord : nextSection;
    const recordRows = rows.slice(start.index + 1, end);
    const province = start.match[1];
    const ordinal = start.match[2];
    if (province === undefined || ordinal === undefined) continue;

    const unit: LocalUnit = { number: `${province.toUpperCase()}/${ordinal}` };
    const openingDate = inlineValue(
      recordRows,
      /\bdata (?:di )?apertura\s*:?\s*(\d{2}\/\d{2}\/\d{4})\b/i,
    );
    const parsedOpeningDate =
      openingDate === undefined ? undefined : parseItalianDate(openingDate);
    if (parsedOpeningDate !== undefined) unit.openingDate = parsedOpeningDate;

    const address = multilineValue(recordRows, ADDRESS_LABEL);
    if (address !== undefined) unit.address = address;
    const reaNumber = inlineValue(
      recordRows,
      /\bnumero repertorio economico amministrativo\s*:?\s*(.+)$/i,
    );
    if (reaNumber !== undefined) unit.reaNumber = reaNumber;
    const primaryActivity = multilineValue(recordRows, ACTIVITY_LABEL);
    if (primaryActivity !== undefined) unit.primaryActivity = primaryActivity;
    result.push(unit);
  }

  return result;
}
