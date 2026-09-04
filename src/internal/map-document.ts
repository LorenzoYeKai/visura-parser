import type { VisuraDocument } from '../types.js';
import { parseItalianBoolean, parseItalianCount } from './values.js';

/** Maps recognized scalar facts into the published schema without inventing defaults. */
export function mapDocument(
  fields: Readonly<Partial<Record<string, string>>>,
): VisuraDocument {
  const result: VisuraDocument = {};
  for (const key of [
    'registeredOfficeAddress',
    'certifiedEmail',
    'reaNumber',
    'taxCode',
    'vatNumber',
    'leiCode',
    'legalForm',
    'incorporationDate',
    'registrationDate',
    'lastProtocolDate',
  ] as const) {
    const value = fields[key];
    if (value !== undefined) result[key] = value;
  }
  const activity: NonNullable<VisuraDocument['activity']> = {};
  for (const key of [
    'status',
    'startDate',
    'primaryActivity',
    'atecoCode',
    'naceCode',
    'importExportActivity',
    'networkContract',
  ] as const) {
    const value = fields[key];
    if (value !== undefined) activity[key] = value;
  }
  for (const key of [
    'licensesAndRegistrations',
    'environmentalRegistrations',
  ] as const) {
    const value = fields[key];
    if (value !== undefined) activity[key] = [value];
  }
  if (Object.keys(activity).length) result.activity = activity;

  const summary: NonNullable<VisuraDocument['companySummary']> = {};
  for (const key of [
    'shareholdersCount',
    'directorsCount',
    'officeHoldersCount',
    'localUnitsCount',
    'filingsLast12Months',
    'shareTransfersCount',
    'registeredOfficeTransfersCount',
  ] as const) {
    const value = fields[key];
    const count = value === undefined ? undefined : parseItalianCount(value);
    if (count !== undefined) summary[key] = count;
  }
  const equity = fields['hasEquityInterests'];
  const hasEquity =
    equity === undefined ? undefined : parseItalianBoolean(equity);
  if (hasEquity !== undefined) summary.hasEquityInterests = hasEquity;
  if (Object.keys(summary).length) result.companySummary = summary;

  const employees = fields['employeeCount'];
  const employeeCount =
    employees === undefined ? undefined : parseItalianCount(employees);
  if (employeeCount !== undefined) result.employees = { count: employeeCount };
  const filings = fields['filingCount'];
  const filingCount =
    filings === undefined ? undefined : parseItalianCount(filings);
  if (filingCount !== undefined)
    result.businessRegisterFilings = { count: filingCount };

  const certifications: NonNullable<VisuraDocument['certifications']> = {};
  for (const key of ['soa', 'quality'] as const) {
    const value = fields[key];
    if (value !== undefined) certifications[key] = [value];
  }
  if (Object.keys(certifications).length)
    result.certifications = certifications;

  const documents: NonNullable<VisuraDocument['availableDocuments']> = {};
  for (const key of [
    'companyFileAvailable',
    'articlesOfAssociationAvailable',
  ] as const) {
    const value = fields[key];
    const available =
      value === undefined ? undefined : parseItalianBoolean(value);
    if (available !== undefined) documents[key] = available;
  }
  const acts = fields['otherActsCount'];
  const count = acts === undefined ? undefined : parseItalianCount(acts);
  if (count !== undefined) documents.otherActsCount = count;
  const years = fields['financialStatementYears'];
  if (years !== undefined) {
    // Only explicit years are facts. A trailing ellipsis does not imply intermediate years.
    const tokens = years
      .replace(/\.{3}$|…$/u, '')
      .trim()
      .split(/[\s,;]+/);
    if (
      tokens.every(
        (token) =>
          /^\d{4}$/.test(token) &&
          Number(token) >= 1900 &&
          Number(token) <= 2200,
      )
    ) {
      documents.financialStatementYears = [...new Set(tokens.map(Number))];
    }
  }
  if (Object.keys(documents).length) result.availableDocuments = documents;
  return result;
}
