import type { Officer, Representative, Shareholder } from '../types.js';
import type { ExtractedPage, ExtractedPdf, PositionedSpan } from './model.js';
import { foldText, normalizeText, semanticSpans } from './text.js';
import { parseItalianAmount, parseItalianDate } from './values.js';
import { joinPages } from './join-pages.js';

const OFFICER_ROLE =
  /^(?:presidente(?: (?:del )?consiglio (?:di |d')?amministrazione| del collegio sindacale)?|vice ?presidente(?: (?:del )?consiglio (?:di |d')?amministrazione)?|amministrat(?:ore|rice)(?: unic[oa]| delegat[oa])?|consigliere(?: delegato)?|sindaco(?: effettivo| supplente)?|titolare(?: dell'impresa individuale| di impresa individuale| firmatari[oa])?|liquidatore|procuratore(?: speciale| generale)?|legale rappresentante)$/i;
const PARTNER_GOVERNANCE_ROLE =
  /^soci[oa] (?:accomandatari[oa]|amministrat(?:ore|rice)|legale rappresentante)$/i;
const SHAREHOLDER_ROLE = /^soci[oa](?: unic[oa]| accomandante)?$/i;
const RIGHT = /^(?:(?:nuda )?propriet[aà]'?|usufrutto)$/i;
const TAX_CODE = /^(?:codice fiscale\s*:?\s*)?([A-Z0-9]{16}|\d{11})$/i;
const SECTION =
  /^(?:\d+\s+)(?:soci|amministratori|sindaci|titolari|altre cariche|attivit[aà]'?|sede|capitale|storia|informazioni|trasferimenti|scioglimento|protocollo)\b/i;
const PEOPLE_SECTION =
  /^\d+\s+(?:soci|amministratori|sindaci|titolari|altre cariche)\b/i;
const OWNERSHIP_ROW_TOLERANCE = 5;

interface PersonRoleClassification {
  readonly officer: boolean;
  readonly shareholder: boolean;
  readonly right: boolean;
  readonly soleShareholder: boolean;
}

function classifyPersonRole(text: string): PersonRoleClassification {
  const value = normalizeText(text);
  const partnerGovernance = PARTNER_GOVERNANCE_ROLE.test(value);
  const right = RIGHT.test(value);
  return {
    officer: OFFICER_ROLE.test(value) || partnerGovernance,
    shareholder: SHAREHOLDER_ROLE.test(value) || partnerGovernance || right,
    right,
    soleShareholder: /^soci[oa] unic[oa]$/i.test(value),
  };
}

export function isPersonRole(text: string): boolean {
  const role = classifyPersonRole(text);
  return role.officer || role.shareholder;
}

function isName(text: string): boolean {
  return (
    text.length >= 2 &&
    text.length <= 160 &&
    /[a-zà-ù]/i.test(text) &&
    !/[:;]|^\d|^[a-z]{0,3}\d{5,}/i.test(text) &&
    !TAX_CODE.test(text) &&
    !/^(?:elenco|numero|codice|nato|nata|residente|domicilio|residenza|indirizzo|\(?in carica|dal\s+\d|durata|quota|valore|tipo diritto|rappresentante|informazioni|amministratori|soci\b|sindaci|titolari|data |carica\b|poteri\b|registro|camera|visura|via\b|viale\b|piazza\b|cittadinanza|proprieta|versato|euro\b|capitale)/i.test(
      text,
    ) &&
    !isPersonRole(text)
  );
}

interface Identity {
  name: PositionedSpan;
  taxCode: string;
  y: number;
  details: PersonDetails;
}

interface PersonDetails {
  birthDate?: string;
  birthPlace?: string;
  birthProvince?: string;
  citizenship?: string;
  residenceAddress?: string;
}

function identities(
  page: ExtractedPage,
  spans: readonly PositionedSpan[],
): Identity[] {
  const result: Identity[] = [];
  for (const span of spans) {
    const match = TAX_CODE.exec(normalizeText(span.text));
    if (!match?.[1]) continue;
    const name = page.spans
      .filter(
        (candidate) =>
          candidate.y >= span.y - 2 &&
          candidate.y - span.y < 85 &&
          Math.abs(candidate.x - span.x) < 220 &&
          isName(normalizeText(candidate.text)) &&
          !page.spans.some(
            (label) =>
              Math.abs(label.y - candidate.y) <= 2 &&
              label.x < candidate.x &&
              /^(?:nato|nata|domicilio|residenza|indirizzo|cittadinanza)\b/i.test(
                normalizeText(label.text),
              ),
          ),
      )
      .sort((a, b) => a.y - b.y)[0];
    if (
      name &&
      !result.some((item) => item.name === name && item.taxCode === match[1])
    )
      result.push({ name, taxCode: match[1], y: span.y, details: {} });
  }
  for (const record of result) {
    const next = result
      .filter(
        (candidate) =>
          candidate.y < record.y - 2 &&
          candidate.name.x < page.width / 2 === record.name.x < page.width / 2,
      )
      .sort((left, right) => right.y - left.y)[0];
    const upper = record.name.y + OWNERSHIP_ROW_TOLERANCE;
    const lower = Math.max(
      record.y - 100,
      next === undefined ? -Infinity : next.y + OWNERSHIP_ROW_TOLERANCE,
    );
    record.details = parsePersonDetails(
      spans.filter((candidate) => candidate.y <= upper && candidate.y > lower),
    );
  }
  return result;
}

function adjacentName(
  page: ExtractedPage,
  role: PositionedSpan,
  roleFragments: ReadonlySet<PositionedSpan>,
): PositionedSpan | undefined {
  const samePanel = (span: PositionedSpan) =>
    span.x < page.width / 2 === role.x < page.width / 2;
  const candidates = page.spans.filter(
    (span) =>
      span !== role &&
      !roleFragments.has(span) &&
      isName(normalizeText(span.text)),
  );
  return (
    candidates
      .filter(
        (span) =>
          samePanel(span) &&
          span.x > role.x + role.width - 2 &&
          Math.abs(span.y - role.y) <= 4,
      )
      .sort((a, b) => a.x - b.x)[0] ??
    candidates
      .filter(
        (span) =>
          samePanel(span) &&
          Math.abs(span.x - role.x) <= 35 &&
          role.y - span.y >= 4 &&
          role.y - span.y <= 34,
      )
      .sort((a, b) => b.y - a.y)[0]
  );
}

function fullName(page: ExtractedPage, first: PositionedSpan): string {
  const parts = [first.text];
  let previous = first;
  for (const span of [...page.spans].sort((a, b) => b.y - a.y)) {
    if (span.y >= previous.y - 2 || Math.abs(span.x - first.x) > 3) continue;
    if (
      previous.y - span.y > 15 ||
      Math.abs(span.height - first.height) > 0.5 ||
      !isName(normalizeText(span.text)) ||
      page.spans.some(
        (label) => label.x < first.x - 10 && Math.abs(label.y - span.y) <= 2,
      )
    )
      break;
    parts.push(span.text);
    previous = span;
  }
  return normalizeText(parts.join(' '));
}

function identityForName(
  page: ExtractedPage,
  records: readonly Identity[],
  name: PositionedSpan,
): Identity | undefined {
  const direct = records.find((record) => record.name === name);
  if (direct !== undefined) return direct;
  const foldedName = foldText(fullName(page, name));
  const matching = records.filter(
    (record) => foldText(fullName(page, record.name)) === foldedName,
  );
  return matching.length === 1 ? matching[0] : undefined;
}

function valueBeside(
  label: PositionedSpan,
  spans: readonly PositionedSpan[],
): string | undefined {
  const candidates = spans.filter(
    (span) =>
      span !== label &&
      Math.abs(span.y - label.y) <= 2 &&
      span.x > label.x + label.width - 2,
  );
  const leftmost = candidates.reduce(
    (minimum, span) => Math.min(minimum, span.x),
    Infinity,
  );
  const value = candidates
    .filter((span) => Math.abs(span.x - leftmost) <= 2)
    .sort((left, right) => right.width - left.width)[0];
  return value === undefined ? undefined : normalizeText(value.text);
}

function valueBelow(
  label: PositionedSpan,
  spans: readonly PositionedSpan[],
): PositionedSpan | undefined {
  return spans
    .filter(
      (span) =>
        span.y < label.y - 2 &&
        label.y - span.y <= 36 &&
        span.x >= label.x - 2 &&
        !TAX_CODE.test(normalizeText(span.text)) &&
        !/^(?:codice fiscale|cittadinanza|residenza|residente|nat[oa]\b|carica\b)/i.test(
          normalizeText(span.text),
        ),
    )
    .sort(
      (left, right) =>
        right.y - left.y || left.x - right.x || right.width - left.width,
    )[0];
}

function assignBirthDetails(result: PersonDetails, value: string): void {
  const normalized = normalizeText(value).replace(/^:\s*/, '');
  const dateMatch = /(?:^|\s)il\s+(\d{2}\/\d{2}\/\d{4})(?:\s|$)/i.exec(
    normalized,
  );
  const placeWithProvince = normalizeText(
    dateMatch === null ? normalized : normalized.slice(0, dateMatch.index),
  );
  const province = /^(.*?)\s+\(([A-Z]{2})\)$/i.exec(placeWithProvince);
  const place = normalizeText(province?.[1] ?? placeWithProvince);
  if (place.length > 0 && result.birthPlace === undefined)
    result.birthPlace = place;
  if (province?.[2] && result.birthProvince === undefined)
    result.birthProvince = province[2].toUpperCase();
  if (dateMatch?.[1] && result.birthDate === undefined) {
    const date = parseItalianDate(dateMatch[1]);
    if (date !== undefined) result.birthDate = date;
  }
}

function parsePersonDetails(spans: readonly PositionedSpan[]): PersonDetails {
  const result: PersonDetails = {};
  const ordered = [...spans].sort(
    (left, right) =>
      right.y - left.y || left.x - right.x || left.width - right.width,
  );

  for (const span of ordered) {
    const text = normalizeText(span.text);
    const born = /^nat[oa]\s+(?:ad|a)\s*:?[ ]*(.+)$/i.exec(text);
    if (born?.[1]) assignBirthDetails(result, born[1]);
    if (/^nat[oa]\s+(?:ad|a)\s*:?$/i.test(text)) {
      const beside = valueBeside(span, spans);
      const below = beside === undefined ? valueBelow(span, spans) : undefined;
      const value = beside ?? below?.text;
      if (value !== undefined) {
        const followingDate =
          below === undefined
            ? undefined
            : spans.find(
                (candidate) =>
                  candidate.y < below.y - 2 &&
                  below.y - candidate.y <= 20 &&
                  Math.abs(candidate.x - below.x) <= 3 &&
                  /^il\s+\d{2}\/\d{2}\/\d{4}$/i.test(
                    normalizeText(candidate.text),
                  ),
              );
        assignBirthDetails(
          result,
          `${normalizeText(value)}${followingDate === undefined ? '' : ` ${normalizeText(followingDate.text)}`}`,
        );
      }
    }

    const citizenship = /^cittadinanza\s*:?\s*(.*)$/i.exec(text);
    if (citizenship !== null && result.citizenship === undefined) {
      const value =
        citizenship[1] ||
        valueBeside(span, spans) ||
        valueBelow(span, spans)?.text;
      if (value) result.citizenship = normalizeText(value);
    }

    const residence = /^(?:residenza|residente(?:\s+a)?)\s*:?\s*(.*)$/i.exec(
      text,
    );
    if (residence !== null && result.residenceAddress === undefined) {
      const value =
        residence[1] ||
        valueBeside(span, spans) ||
        valueBelow(span, spans)?.text;
      if (value) result.residenceAddress = normalizeText(value);
    }
  }
  return result;
}

function personDetailSpans(
  spans: readonly PositionedSpan[],
  records: readonly Identity[],
  sections: readonly PositionedSpan[],
  pageWidth: number,
  role: PositionedSpan,
  name: PositionedSpan,
): PositionedSpan[] {
  const nextIdentity = records
    .filter(
      (record) =>
        record.name.y < name.y - 2 &&
        record.name.x < pageWidth / 2 === name.x < pageWidth / 2,
    )
    .sort((left, right) => right.name.y - left.name.y)[0];
  const nextSection = sections
    .filter((span) => span.y < name.y)
    .sort((left, right) => right.y - left.y)[0];
  const lower = Math.max(
    name.y - 180,
    nextIdentity === undefined
      ? -Infinity
      : nextIdentity.name.y + OWNERSHIP_ROW_TOLERANCE,
    nextSection?.y ?? -Infinity,
  );
  const upper = Math.max(role.y, name.y) + OWNERSHIP_ROW_TOLERANCE;
  return spans.filter(
    (span) =>
      span.y <= upper &&
      span.y > lower &&
      !SECTION.test(normalizeText(span.text)),
  );
}

function ownershipDetailSpans(
  spans: readonly PositionedSpan[],
  roles: readonly PositionedSpan[],
  sections: readonly PositionedSpan[],
  role: PositionedSpan,
  name: PositionedSpan,
): PositionedSpan[] {
  const nextRole = roles.find((other) => other.y < name.y - 2);
  const nextSection = sections
    .filter((span) => span.y < name.y)
    .sort((left, right) => right.y - left.y)[0];
  const lower = Math.max(
    name.y - 180,
    nextRole === undefined ? -Infinity : nextRole.y + OWNERSHIP_ROW_TOLERANCE,
    nextSection?.y ?? -Infinity,
  );
  return spans.filter(
    (span) =>
      span.y <= role.y + OWNERSHIP_ROW_TOLERANCE &&
      span.y > lower &&
      !SECTION.test(normalizeText(span.text)),
  );
}

function mergePersonDetails(
  target: PersonDetails,
  source: PersonDetails,
): void {
  for (const key of [
    'birthDate',
    'birthPlace',
    'birthProvince',
    'citizenship',
    'residenceAddress',
  ] as const) {
    if (target[key] === undefined && source[key] !== undefined)
      target[key] = source[key];
  }
}

function mergeOfficer(officers: Officer[], entry: Officer): void {
  const existing = officers.find((other) =>
    entry.taxCode !== undefined && other.taxCode !== undefined
      ? entry.taxCode === other.taxCode
      : foldText(other.name ?? '') === foldText(entry.name ?? ''),
  );
  if (!existing) {
    officers.push(entry);
    return;
  }
  if (entry.taxCode !== undefined) existing.taxCode = entry.taxCode;
  mergePersonDetails(existing, entry);
  for (const role of entry.roles ?? []) {
    existing.roles ??= [];
    if (!existing.roles.some((other) => foldText(other) === foldText(role)))
      existing.roles.push(role);
  }
}

export function parsePeople(
  pdf: ExtractedPdf,
  coverPage: number,
): {
  primaryRepresentative?: Representative;
  officers: Officer[];
  shareholders: Shareholder[];
} {
  const result: {
    primaryRepresentative?: Representative;
    officers: Officer[];
    shareholders: Shareholder[];
  } = { officers: [], shareholders: [] };
  const page = joinPages(pdf.pages);
  const spans = semanticSpans(page);
  const records = identities(page, spans);
  const sections = spans
    .filter(
      (span) =>
        span.x < page.width * 0.15 && SECTION.test(normalizeText(span.text)),
    )
    .sort((a, b) => a.y - b.y);
  // Longer reconstructed roles take precedence over a contained 'Presidente'.
  const roles = spans
    .filter((span) => isPersonRole(span.text))
    .filter((span) => {
      const section = sections.find((heading) => heading.y >= span.y);
      return (
        section === undefined ||
        PEOPLE_SECTION.test(normalizeText(section.text))
      );
    })
    .filter(
      (span) =>
        !spans.some(
          (other) =>
            other !== span &&
            other.x <= span.x &&
            Math.abs(other.y - span.y) <= 2 &&
            other.width > span.width &&
            other.x + other.width >= span.x + span.width &&
            isPersonRole(other.text),
        ),
    )
    .sort((a, b) => b.y - a.y || a.x - b.x);
  const roleFragments = new Set(
    page.spans.filter((span) =>
      roles.some(
        (role) =>
          role !== span &&
          Math.abs(role.x - span.x) <= 3 &&
          role.y - span.y >= 0 &&
          role.y - span.y <= 36 &&
          normalizeText(role.text).endsWith(` ${normalizeText(span.text)}`),
      ),
    ),
  );
  for (const role of roles) {
    const text = normalizeText(role.text);
    const classification = classifyPersonRole(text);
    // A value beside 'carica' belongs to the preceding identity. The next
    // row can be another qualification, not a new person's name.
    const isDetailRole = page.spans.some(
      (span) =>
        span.x < role.x &&
        Math.abs(span.y - role.y) <= 2 &&
        /^carica$/i.test(normalizeText(span.text)),
    );
    const adjacent = isDetailRole
      ? undefined
      : adjacentName(page, role, roleFragments);
    let identity =
      adjacent === undefined
        ? undefined
        : identityForName(page, records, adjacent);
    if (adjacent === undefined) {
      identity = records
        .filter(
          (record) =>
            record.y > role.y &&
            record.y - role.y < 220 &&
            !spans.some(
              (span) =>
                SECTION.test(normalizeText(span.text)) &&
                span.y < record.y &&
                span.y > role.y,
            ) &&
            !records.some(
              (other) =>
                other !== record &&
                other.name.y < record.y &&
                other.name.y > role.y,
            ),
        )
        .sort((a, b) => a.y - b.y)[0];
    }
    const name = adjacent ?? identity?.name;
    if (name === undefined) continue;
    const details = { ...(identity?.details ?? {}) };
    mergePersonDetails(
      details,
      parsePersonDetails(
        personDetailSpans(spans, records, sections, page.width, role, name),
      ),
    );
    const person = {
      name: fullName(page, name),
      ...(identity ? { taxCode: identity.taxCode } : {}),
      ...details,
    };
    if (classification.officer) {
      mergeOfficer(result.officers, { ...person, roles: [text] });
      if (
        role.page === coverPage &&
        adjacent !== undefined &&
        !spans.some(
          (span) => SECTION.test(normalizeText(span.text)) && span.y > role.y,
        ) &&
        result.primaryRepresentative === undefined &&
        !/^(?:sindaco|presidente del collegio)/i.test(text)
      ) {
        result.primaryRepresentative = { name: person.name, role: text };
      }
    }
    if (classification.shareholder) {
      const shareholder: Shareholder = { ...person };
      if (classification.right) shareholder.rightType = text;
      if (classification.soleShareholder) shareholder.isSoleShareholder = true;
      if (
        role.page === coverPage &&
        adjacent !== undefined &&
        result.primaryRepresentative === undefined &&
        spans.some(
          (span) =>
            span.page === coverPage &&
            Math.abs(span.x - name.x) <= 3 &&
            name.y - span.y > 0 &&
            name.y - span.y <= 20 &&
            /^rappresentante dell'impresa$/i.test(normalizeText(span.text)),
        )
      )
        result.primaryRepresentative = { name: person.name, role: text };
      // Quota facts must be inside this ownership record. No capital/paid-up fallback.
      const ownershipDetails = ownershipDetailSpans(
        spans,
        roles,
        sections,
        role,
        name,
      );
      for (const span of ownershipDetails) {
        const value = normalizeText(span.text);
        const nominal =
          /^(?:valore nominale|quota)\s*(?:di nominali)?\s*:?\s*([\d.,]+)\s*(euro|EUR)?$/i.exec(
            value,
          );
        if (nominal?.[1]) {
          const amount = parseItalianAmount(nominal[1]);
          if (amount !== undefined) shareholder.nominalValue = amount;
          if (nominal[2]) shareholder.currency = 'EUR';
        }
        const percentage =
          /^(?:percentuale(?: di partecipazione)?\s*:?\s*)?([\d.,]+)\s*%$/i.exec(
            value,
          );
        const amount =
          percentage?.[1] === undefined
            ? undefined
            : parseItalianAmount(percentage[1]);
        if (amount !== undefined && amount <= 100)
          shareholder.ownershipPercentage = amount;
        const right = /^tipo (?:di )?diritto\s*:\s*(.+)$/i.exec(value);
        if (right?.[1] && RIGHT.test(right[1]))
          shareholder.rightType = right[1];
      }
      const existing = result.shareholders.find(
        (other) =>
          (person.taxCode !== undefined && other.taxCode !== undefined
            ? other.taxCode === person.taxCode
            : foldText(other.name ?? '') === foldText(person.name)) &&
          (other.rightType === undefined ||
            shareholder.rightType === undefined ||
            foldText(other.rightType) === foldText(shareholder.rightType)) &&
          (other.nominalValue === undefined ||
            shareholder.nominalValue === undefined ||
            other.nominalValue === shareholder.nominalValue),
      );
      if (existing) {
        mergePersonDetails(existing, shareholder);
        Object.assign(existing, {
          ...(shareholder.taxCode !== undefined
            ? { taxCode: shareholder.taxCode }
            : {}),
          ...(shareholder.rightType !== undefined
            ? { rightType: shareholder.rightType }
            : {}),
          ...(shareholder.nominalValue !== undefined
            ? { nominalValue: shareholder.nominalValue }
            : {}),
          ...(shareholder.currency !== undefined
            ? { currency: shareholder.currency }
            : {}),
          ...(shareholder.ownershipPercentage !== undefined
            ? { ownershipPercentage: shareholder.ownershipPercentage }
            : {}),
          ...(shareholder.isSoleShareholder !== undefined
            ? { isSoleShareholder: shareholder.isSoleShareholder }
            : {}),
        });
      } else result.shareholders.push(shareholder);
    }
  }
  for (const record of records) {
    for (const person of [...result.officers, ...result.shareholders]) {
      if (person.taxCode === record.taxCode)
        mergePersonDetails(person, record.details);
    }
  }
  for (const shareholder of result.shareholders) {
    if (shareholder.taxCode === undefined) continue;
    const officer = result.officers.find(
      (candidate) => candidate.taxCode === shareholder.taxCode,
    );
    if (officer === undefined) continue;
    mergePersonDetails(officer, shareholder);
    mergePersonDetails(shareholder, officer);
  }
  return result;
}
