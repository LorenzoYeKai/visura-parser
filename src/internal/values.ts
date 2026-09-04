const ITALIAN_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const ITALIAN_AMOUNT = /^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/;
const ITALIAN_INTEGER = /^(?:\d+|\d{1,3}(?:\.\d{3})+)$/;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function parseItalianDate(value: string): string | undefined {
  const match = ITALIAN_DATE.exec(value.trim());
  if (match === null) return undefined;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const monthLengths = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  const maximumDay = monthLengths[month - 1];
  if (maximumDay === undefined || day < 1 || day > maximumDay) return undefined;

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseItalianAmount(value: string): number | undefined {
  const normalized = value.trim();
  if (!ITALIAN_AMOUNT.test(normalized)) return undefined;

  const [integerPart = '', decimalPart = ''] = normalized.split(',');
  const centsText = `${integerPart.replaceAll('.', '')}${decimalPart.padEnd(2, '0')}`;
  const cents = Number(centsText);
  if (!Number.isSafeInteger(cents)) return undefined;

  const amount = cents / 100;
  // JSON uses the shortest decimal representation. Reject a value when that
  // representation would change a source cent at the upper end of the range.
  const [whole = '', fraction = ''] = String(amount).split('.');
  const serializedCents = BigInt(`${whole}${fraction.padEnd(2, '0')}`);
  return serializedCents === BigInt(centsText) ? amount : undefined;
}

export function parseItalianCount(value: string): number | undefined {
  const normalized = value.trim();
  if (!ITALIAN_INTEGER.test(normalized)) return undefined;

  const count = Number(normalized.replaceAll('.', ''));
  return Number.isSafeInteger(count) ? count : undefined;
}

export function parseItalianBoolean(value: string): boolean | undefined {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'si' || normalized === 'sì') return true;
  if (normalized === 'no') return false;
  return undefined;
}
