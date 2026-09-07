import type { VisuraDocument } from '../types.js';
import type { ExtractedPage, ExtractedPdf, PositionedSpan } from './model.js';
import { normalizeText, pageText, semanticSpans } from './text.js';
import { parseItalianDate } from './values.js';
import { mapDocument } from './map-document.js';
import { isPersonRole, parsePeople } from './parse-people.js';
import { parseClassifications } from './parse-classifications.js';
import { parseCapital } from './parse-capital.js';
import { joinPages } from './join-pages.js';
import { parseLocalUnits } from './parse-local-units.js';

interface FieldSpec {
  readonly key: string;
  readonly labels: readonly RegExp[];
  readonly pages: 'cover' | 'all' | 'identity' | 'activity';
  readonly multiline?: boolean;
}

type SpansForPage = (page: ExtractedPage) => readonly PositionedSpan[];

interface PreparedPage {
  readonly spans: readonly PositionedSpan[];
  readonly labels: readonly { span: PositionedSpan; text: string }[];
}

type PreparePage = (page: ExtractedPage) => PreparedPage;

const FIELD_SPECS = [
  {
    key: 'registeredOfficeAddress',
    labels: [
      /^indirizzo (?:della )?sede\s*legale$/i,
      /^indirizzo sede$/i,
      /^indirizzo$/i,
      /^sede legale$/i,
    ],
    pages: 'cover',
    multiline: true,
  },
  {
    key: 'certifiedEmail',
    labels: [/^domicilio digitale\/?pec$/i, /^pec$/i],
    pages: 'cover',
  },
  { key: 'reaNumber', labels: [/^numero rea$/i], pages: 'cover' },
  {
    key: 'taxCode',
    labels: [/^codice fiscale(?: e n\.iscr\. al)?$/i, /^codice fiscale$/i],
    pages: 'cover',
  },
  { key: 'vatNumber', labels: [/^partita iva$/i], pages: 'all' },
  { key: 'leiCode', labels: [/^codice lei$/i], pages: 'cover' },
  {
    key: 'legalForm',
    labels: [/^forma giuridica$/i],
    pages: 'cover',
    multiline: true,
  },
  {
    key: 'incorporationDate',
    labels: [/^data atto di costituzione$/i],
    pages: 'identity',
  },
  {
    key: 'registrationDate',
    labels: [/^data (?:di )?iscrizione$/i],
    pages: 'identity',
  },
  {
    key: 'lastProtocolDate',
    labels: [/^data ultimo protocollo$/i],
    pages: 'cover',
  },
  { key: 'status', labels: [/^stato attivit[aà]'?$/i], pages: 'all' },
  {
    key: 'startDate',
    labels: [/^data inizio (?:dell')?attivit[aà]'?(?: dell'impresa)?$/i],
    pages: 'activity',
  },
  {
    key: 'primaryActivity',
    labels: [/^attivit[aà]'? prevalente$/i],
    pages: 'activity',
    multiline: true,
  },
  { key: 'atecoCode', labels: [/^codice ateco$/i], pages: 'cover' },
  { key: 'naceCode', labels: [/^codice nace(?: 2\.1)?$/i], pages: 'cover' },
  {
    key: 'importExportActivity',
    labels: [/^attivit[aà]'? import export$/i],
    pages: 'cover',
  },
  { key: 'networkContract', labels: [/^contratto di rete$/i], pages: 'cover' },
  {
    key: 'licensesAndRegistrations',
    labels: [/^albi ruoli e licenze$/i],
    pages: 'cover',
  },
  {
    key: 'environmentalRegistrations',
    labels: [/^albi e registri ambientali$/i],
    pages: 'cover',
  },
  { key: 'coverCapital', labels: [/^capitale sociale$/i], pages: 'cover' },
  {
    key: 'employeeCount',
    labels: [/^addetti(?: al .+|\s*\(.+\))?$/i],
    pages: 'cover',
  },
  {
    key: 'filingCount',
    labels: [/^documenti ri(?: dal .+|\s*\(.+\))?$/i],
    pages: 'cover',
  },
  {
    key: 'shareholdersCount',
    labels: [/^soci e titolari di diritti su azioni e quote$/i, /^soci$/i],
    pages: 'cover',
  },
  { key: 'directorsCount', labels: [/^amministratori$/i], pages: 'cover' },
  {
    key: 'officeHoldersCount',
    labels: [/^titolari di cariche$/i],
    pages: 'cover',
  },
  { key: 'localUnitsCount', labels: [/^unit[aà]'? locali$/i], pages: 'cover' },
  {
    key: 'filingsLast12Months',
    labels: [/^pratiche inviate negli ultimi 12 mesi$/i],
    pages: 'cover',
  },
  { key: 'soa', labels: [/^attestazioni soa$/i], pages: 'cover' },
  {
    key: 'shareTransfersCount',
    labels: [/^trasferimenti di quote$/i],
    pages: 'cover',
  },
  {
    key: 'registeredOfficeTransfersCount',
    labels: [/^trasferimenti di sede$/i],
    pages: 'cover',
  },
  { key: 'hasEquityInterests', labels: [/^partecipazioni$/i], pages: 'cover' },
  { key: 'companyFileAvailable', labels: [/^fascicolo$/i], pages: 'cover' },
  {
    key: 'articlesOfAssociationAvailable',
    labels: [/^statuto$/i],
    pages: 'cover',
  },
  { key: 'otherActsCount', labels: [/^altri atti$/i], pages: 'cover' },
  {
    key: 'quality',
    labels: [/^certificazioni di qualit[aà]'?$/i],
    pages: 'cover',
  },
  { key: 'financialStatementYears', labels: [/^bilanci$/i], pages: 'cover' },
] as const satisfies readonly FieldSpec[];

type ScalarKey = (typeof FIELD_SPECS)[number]['key'];

const ALL_LABELS = FIELD_SPECS.flatMap((field) => field.labels);
const DATE_FIELDS: ReadonlySet<ScalarKey> = new Set([
  'incorporationDate',
  'registrationDate',
  'lastProtocolDate',
  'startDate',
]);

function matchesAny(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function isKnownLabel(text: string): boolean {
  const normalized = normalizeText(text);
  return (
    isPersonRole(normalized) ||
    ALL_LABELS.some((pattern) => pattern.test(normalized))
  );
}

function samePanel(
  page: ExtractedPage,
  left: PositionedSpan,
  right: PositionedSpan,
): boolean {
  const midpoint = page.width / 2;
  return left.x < midpoint === right.x < midpoint;
}

function inlineValue(
  text: string,
  patterns: readonly RegExp[],
): string | undefined {
  const separator = text.indexOf(':');
  if (separator < 0 || !matchesAny(text.slice(0, separator).trim(), patterns))
    return undefined;
  const value = normalizeText(text.slice(separator + 1));
  if (value.length > 0) return value;
  return undefined;
}

function findValueOnPage(
  page: ExtractedPage,
  prepared: PreparedPage,
  patterns: readonly RegExp[],
  multiline = false,
  fullWidth = false,
): string | undefined {
  const labels = prepared.labels.filter(
    ({ text }) =>
      matchesAny(text, patterns) || inlineValue(text, patterns) !== undefined,
  );

  for (const { span: label, text } of labels) {
    const inline = inlineValue(text, patterns);
    if (inline !== undefined) return inline;

    const candidates = page.spans
      .filter(
        (span) =>
          span !== label &&
          (fullWidth || samePanel(page, label, span)) &&
          span.x >= label.x + Math.max(label.width, 10) - 2 &&
          Math.abs(span.y - label.y) <= Math.max(5, label.height * 0.75) &&
          !isKnownLabel(span.text),
      )
      .sort((left, right) => left.x - right.x);

    let value = candidates[0];
    if (value === undefined) {
      value = page.spans
        .filter(
          (span) =>
            span !== label &&
            (fullWidth || samePanel(page, label, span)) &&
            span.x > label.x + Math.max(label.width, 10) - 2 &&
            label.y - span.y >= -3 &&
            label.y - span.y <= 18 &&
            !isKnownLabel(span.text),
        )
        .sort((left, right) => {
          const vertical =
            Math.abs(left.y - label.y) - Math.abs(right.y - label.y);
          return vertical === 0 ? left.x - right.x : vertical;
        })[0];
    }
    if (value === undefined) continue;

    if (!multiline) return normalizeText(value.text);

    const nextLabel = prepared.spans
      .filter(
        (span) =>
          (fullWidth || samePanel(page, value, span)) &&
          span.x < value.x - 10 &&
          span.y < value.y - 2 &&
          (fullWidth || isKnownLabel(span.text)),
      )
      .sort((left, right) => right.y - left.y)[0];
    const lowerBoundary =
      nextLabel?.y ?? (fullWidth ? -Infinity : value.y - 120);
    const continuations = page.spans
      .filter(
        (span) =>
          (fullWidth || samePanel(page, value, span)) &&
          (fullWidth
            ? span.x >= value.x - 8
            : Math.abs(span.x - value.x) <= 8) &&
          value.y - span.y > 2 &&
          span.y > lowerBoundary + 2 &&
          !isKnownLabel(span.text),
      )
      .sort((left, right) => right.y - left.y || left.x - right.x);
    const parts = fullWidth
      ? page.spans
          .filter(
            (span) => span.x >= value.x - 2 && Math.abs(span.y - value.y) <= 2,
          )
          .sort((a, b) => a.x - b.x)
          .map((span) => span.text)
      : [value.text];
    let previousY = value.y;
    for (const continuation of continuations) {
      if (previousY - continuation.y > 18) break;
      parts.push(continuation.text);
      previousY = continuation.y;
    }

    return normalizeText(parts.join(' '));
  }

  return undefined;
}

function findCoverPage(pdf: ExtractedPdf): ExtractedPage {
  return (
    pdf.pages.find((page) => /\bvisura\b/i.test(pageText(page))) ??
    pdf.pages.find((page) => /registro imprese/i.test(pageText(page))) ??
    pdf.pages.find((page) => page.spans.length > 0)!
  );
}

function findBusinessName(
  page: ExtractedPage,
  spans: readonly PositionedSpan[],
): string | undefined {
  const title = spans
    .filter(
      (span) =>
        span.y > page.height * 0.35 &&
        /^(?:visura\s+(?:ordinaria|storica|(?:di\s+)?evasione)\b|soci e titolari di diritti|esito evasione protocollo)/i.test(
          normalizeText(span.text),
        ),
    )
    .sort((left, right) => right.y - left.y || right.width - left.width)[0];
  if (title === undefined) return undefined;

  const first = page.spans
    .filter(
      (span) =>
        span.y < title.y - 8 &&
        span.y > title.y - 95 &&
        span.x < page.width / 2 &&
        /[a-zà-ù]/i.test(span.text) &&
        !/^(camera di commercio|registro imprese|informazioni|sede|codice|rea\b)/i.test(
          normalizeText(span.text),
        ),
    )
    .sort((left, right) => {
      const height = right.height - left.height;
      return Math.abs(height) > 0.5 ? height : right.y - left.y;
    })[0];
  if (first === undefined) return undefined;

  const parts = [first.text];
  let previous = first;
  for (const candidate of [...page.spans].sort((a, b) => b.y - a.y)) {
    if (candidate.y >= previous.y - 3 || Math.abs(candidate.x - first.x) > 3)
      continue;
    if (
      previous.y - candidate.y > 20 ||
      Math.abs(candidate.height - first.height) > 0.5 ||
      isKnownLabel(candidate.text)
    )
      break;
    parts.push(candidate.text);
    previous = candidate;
  }
  return parts.join(' ');
}

function findBusinessNameFromLabels(
  pdf: ExtractedPdf,
  prepare: PreparePage,
): string | undefined {
  const labels = [/^denominazione$/i, /^ditta$/i, /^ragione sociale$/i];
  for (const page of pdf.pages) {
    const value = findValueOnPage(page, prepare(page), labels, true);
    if (value !== undefined) return value;
  }
  return undefined;
}

function detectVisuraType(
  cover: ExtractedPage,
  spans: readonly PositionedSpan[],
): string | undefined {
  const titles = spans.filter((span) => span.y > cover.height * 0.35);
  const title = titles.find((span) =>
    /^visura\s+(?:ordinaria|storica|(?:di\s+)?evasione)\b/i.test(
      normalizeText(span.text),
    ),
  );
  if (title !== undefined) return normalizeText(title.text);
  const evasion = titles.find((span) =>
    /^esito evasione protocollo\b/i.test(normalizeText(span.text)),
  );
  if (evasion !== undefined) return 'Visura di Evasione';
  return undefined;
}

export function isSupportedVisuraBlock(pdf: ExtractedPdf): boolean {
  const cover = findCoverPage(pdf);
  return (
    /dati anagrafici/i.test(pageText(cover)) &&
    cover.spans.some((span) =>
      /^soci e titolari di diritti/i.test(normalizeText(span.text)),
    )
  );
}

function beforeSection(
  pdf: ExtractedPdf,
  heading: RegExp,
  spansFor: SpansForPage,
): ExtractedPdf {
  const pages: ExtractedPage[] = [];
  for (const page of pdf.pages) {
    const boundary = spansFor(page)
      .filter(
        (span) =>
          span.x < page.width * 0.15 && heading.test(normalizeText(span.text)),
      )
      .sort((left, right) => right.y - left.y)[0];
    if (boundary === undefined) {
      pages.push(page);
      continue;
    }
    pages.push({
      ...page,
      spans: page.spans.filter((span) => span.y > boundary.y),
    });
    break;
  }
  return { pages };
}

export function parseExtractedDocument(
  pdf: ExtractedPdf,
  filename?: string,
): VisuraDocument {
  // Reuse phrase reconstruction across fields within this call only. Key by
  // object identity: section-clipped pages can share a source page number.
  const prepared = new Map<ExtractedPage, PreparedPage>();
  const prepare: PreparePage = (page) => {
    let text = prepared.get(page);
    if (text === undefined) {
      const spans = semanticSpans(page);
      text = {
        spans,
        labels: spans.map((span) => ({
          span,
          text: normalizeText(span.text),
        })),
      };
      prepared.set(page, text);
    }
    return text;
  };
  const spansFor: SpansForPage = (page) => prepare(page).spans;
  const cover = findCoverPage(pdf);
  const currentPdf = beforeSection(
    pdf,
    /^(?:\d+\s+)?(?:storia (?:delle|dei|di)|informazioni storiche|protocollo evaso\b)/i,
    spansFor,
  );
  const companyPdf = beforeSection(
    currentPdf,
    /^(?:\d+\s+)?(?:sedi secondarie ed )?unit[aà]'? locali$/i,
    spansFor,
  );
  // Company dates precede the domain sections; later registration dates can
  // belong to a shareholder or an appointment rather than the company.
  const identityPdf = beforeSection(
    companyPdf,
    /^\d+\s+(?:capitale|soci|amministratori|sindaci|titolari|attivit[aà]'?|trasferimenti|scioglimento|altre cariche)\b/i,
    spansFor,
  );
  const fields: Partial<Record<ScalarKey, string>> = {};
  const activityBody = joinPages(
    companyPdf.pages.filter((page) => page.number !== cover.number),
  );
  for (const field of FIELD_SPECS as readonly FieldSpec[]) {
    const key = field.key as ScalarKey;
    const pages =
      field.pages === 'cover'
        ? [cover]
        : field.pages === 'identity'
          ? identityPdf.pages
          : field.pages === 'activity'
            ? [cover, activityBody]
            : companyPdf.pages;
    for (const page of pages) {
      const value = findValueOnPage(
        page,
        prepare(page),
        field.labels,
        field.multiline,
        page === activityBody,
      );
      if (value === undefined) continue;
      const normalized = DATE_FIELDS.has(key) ? parseItalianDate(value) : value;
      if (normalized !== undefined) {
        fields[key] = normalized;
        break;
      }
    }
  }
  const result = mapDocument(fields);
  if (filename !== undefined) result.filename = filename;
  const reportType = detectVisuraType(cover, spansFor(cover));
  if (reportType !== undefined) result.reportType = reportType;
  const name =
    findBusinessName(cover, spansFor(cover)) ??
    findBusinessNameFromLabels(companyPdf, prepare);
  if (name !== undefined) result.companyName = normalizeText(name);

  // Dates belong to their printed summary label, not the report extraction date.
  for (const label of spansFor(cover)) {
    const text = normalizeText(label.text);
    const employees = /^addetti(?: al)?\s*\(?(\d{2}\/\d{2}\/\d{4})\)?$/i.exec(
      text,
    );
    const filings =
      /^documenti ri(?: dal)?\s*\(?(\d{2}\/\d{2}\/\d{4})\)?$/i.exec(text);
    const rawDate = employees?.[1] ?? filings?.[1];
    const date = rawDate === undefined ? undefined : parseItalianDate(rawDate);
    if (date === undefined) continue;
    if (employees)
      result.employees = { ...result.employees, referenceDate: date };
    if (filings)
      result.businessRegisterFilings = {
        ...result.businessRegisterFilings,
        sinceDate: date,
      };
  }
  const people = parsePeople(companyPdf, cover.number);
  if (people.primaryRepresentative)
    result.primaryRepresentative = people.primaryRepresentative;
  if (people.officers.length) result.officers = people.officers;
  if (people.shareholders.length) result.shareholders = people.shareholders;
  const classifications = parseClassifications(companyPdf);
  if (classifications.length)
    result.activity = {
      ...result.activity,
      atecoClassifications: classifications,
    };
  const capital = parseCapital(companyPdf);
  if (capital !== undefined) result.shareCapital = capital;
  const localUnits = parseLocalUnits(currentPdf);
  if (localUnits.length) result.localUnits = localUnits;
  return result;
}
