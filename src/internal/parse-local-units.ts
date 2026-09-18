import type { AtecoClassification, LocalUnit } from '../types.js';
import type { ExtractedPdf, PositionedSpan } from './model.js';
import { joinPages } from './join-pages.js';
import { normalizeText, spansInReadingOrder } from './text.js';
import { parseItalianDate } from './values.js';

interface Row {
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly spans: readonly PositionedSpan[];
}

const LOCAL_UNIT_HEADING =
  /^unit[aà]'? locale n\.?\s*([a-z]{2})\s*\/\s*(\d+)\b/i;
const SECTION_HEADING = /^\d+\s+\D/u;
const ADDRESS_LABEL = /^indirizzo\b\s*:?[\s]*/i;
const ACTIVITY_LABEL = /^attivit[aà]'? esercitata\b\s*:?[\s]*/i;
const SECONDARY_ACTIVITY_LABEL =
  /^attivit[aà]'? secondaria esercitata\b\s*:?[\s]*/i;
const CLASSIFICATION_LABEL = /^classificazione ateco(?:ri)?\b/i;
const TRADE_NAME_LABEL = /^insegna\b\s*:?\s*/i;
const DECLARATION_LABEL =
  /^denuncia (?:di )?(?:inizio )?attivit[aà]'?(?=\s|:|$)\s*:?\s*/i;
const LICENCE_LABEL = /^licenz[ae](?:\/?autorizzazion[ei])?\b\s*:?\s*/i;
const FIELD_OR_BLOCK_LABEL =
  /^(?:data (?:di )?apertura|indirizzo|insegna|codice fiscale|estremi di iscrizione|numero repertorio economico amministrativo|attivit[aà]'? (?:secondaria )?esercitata|classificazione ateco(?:ri)?|denuncia|licenz[ae](?:\/?autorizzazion[ei])?|responsabile tecnico|preposto|carica|albi|addetti|codice nace|tipo)\b/i;

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
      spans: row,
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

function blockValues(rows: readonly Row[], label: RegExp): string[] {
  const values: string[] = [];
  for (const [index, row] of rows.entries()) {
    if (!label.test(row.text)) continue;
    const value = multilineValue(rows.slice(index), label);
    if (value !== undefined) values.push(value);
  }
  return values;
}

function isAlignedType(
  row: Row | undefined,
  heading: Row,
  width: number,
): row is Row {
  return (
    row !== undefined &&
    row.y >= heading.y &&
    row.y - heading.y <= 4 &&
    row.x >= width * 0.3 &&
    !FIELD_OR_BLOCK_LABEL.test(row.text)
  );
}

function classificationsFromRows(rows: readonly Row[]): AtecoClassification[] {
  const result: AtecoClassification[] = [];
  let inBlock = false;
  let version: string | undefined;
  let current: AtecoClassification | undefined;
  let readingDescription = false;
  for (const row of rows) {
    let text = normalizeText(
      row.spans
        .filter(
          (span) => !/^dell'attivit[aà]'?$/i.test(normalizeText(span.text)),
        )
        .map((span) => span.text)
        .join(' '),
    );
    if (CLASSIFICATION_LABEL.test(row.text)) {
      inBlock = true;
      version = /\b(\d{4}(?:\s*-\s*\d{4})?)\b/
        .exec(row.text)?.[1]
        ?.replace(/\s/g, '');
      current = undefined;
      readingDescription = false;
      // The label is in the left column, with the first code alongside it.
      const codeStart = row.text.search(/\bcodice\s*:/i);
      if (codeStart < 0) continue;
      text = row.text.slice(codeStart);
    } else if (FIELD_OR_BLOCK_LABEL.test(row.text)) {
      inBlock = false;
      continue;
    }
    if (!inBlock) continue;
    const code =
      /^(?:codice\s*:?\s*)?(\d{2}(?:\.\d{1,2}){0,2})(?:\s*[-–:]\s*(.+))?$/i.exec(
        text,
      );
    if (code?.[1] !== undefined) {
      current = { code: code[1] };
      if (version !== undefined) current.version = version;
      if (code[2] !== undefined) current.description = code[2];
      result.push(current);
      readingDescription = true;
      continue;
    }
    if (current === undefined) continue;
    const importance = /^importanza\s*:\s*(.+)$/i.exec(text);
    if (importance?.[1] !== undefined) {
      current.importance = importance[1];
      readingDescription = false;
    } else if (/^(?:prevalente|primaria|secondaria)\b/i.test(text)) {
      current.importance = text;
      readingDescription = false;
    } else if (/^fonte\b/i.test(text)) {
      readingDescription = false;
    } else if (readingDescription) {
      current.description = normalizeText(
        `${current.description ?? ''} ${text.replace(/^descrizione\s*:\s*/i, '')}`,
      );
    }
  }
  return result;
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
    const nextStart = starts[position + 1];
    const nextRecord =
      nextStart === undefined
        ? rows.length
        : nextStart.index -
          (isAlignedType(rows[nextStart.index - 1], nextStart.row, page.width)
            ? 1
            : 0);
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
    // Different font baselines put the right-hand facility type slightly
    // above its left-hand record heading in registry PDFs.
    const previousRow = rows[start.index - 1];
    const headingSuffix = normalizeText(
      start.row.text.slice(start.match[0].length),
    );
    const firstRow = recordRows[0];
    const typeRow = isAlignedType(previousRow, start.row, page.width)
      ? previousRow
      : firstRow;
    const typeText = headingSuffix.length > 0 ? headingSuffix : typeRow?.text;
    if (typeText !== undefined && !FIELD_OR_BLOCK_LABEL.test(typeText)) {
      const type = normalizeText(
        typeText.split(/\bdata (?:di )?apertura\b/i)[0] ?? '',
      );
      if (type.length > 0) unit.type = type;
    }
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
    const secondaryActivity = multilineValue(
      recordRows,
      SECONDARY_ACTIVITY_LABEL,
    );
    if (secondaryActivity !== undefined)
      unit.secondaryActivity = secondaryActivity;
    const tradeName = multilineValue(recordRows, TRADE_NAME_LABEL);
    if (tradeName !== undefined) unit.tradeName = tradeName;
    const declarations = blockValues(recordRows, DECLARATION_LABEL);
    if (declarations.length > 0) unit.activityDeclarations = declarations;
    const licences = blockValues(recordRows, LICENCE_LABEL);
    if (licences.length > 0) unit.licensesAndRegistrations = licences;
    const classifications = classificationsFromRows(recordRows);
    if (classifications.length > 0) {
      unit.atecoClassifications = classifications;
      const primary =
        classifications.find((classification) =>
          /^(?:primaria|prevalente)\b/i.test(classification.importance ?? ''),
        ) ??
        classifications.find(
          (classification) => classification.importance === undefined,
        );
      if (primary?.code !== undefined) unit.atecoCode = primary.code;
    }
    result.push(unit);
  }

  return result;
}
