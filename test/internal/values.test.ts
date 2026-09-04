import { describe, expect, it } from 'vitest';

import {
  parseItalianAmount,
  parseItalianBoolean,
  parseItalianCount,
  parseItalianDate,
} from '../../src/internal/values.js';

describe('parseItalianDate', () => {
  it.each([
    ['05/12/2017', '2017-12-05'],
    ['29/02/2024', '2024-02-29'],
    ['29/02/2023', undefined],
    ['31/04/2024', undefined],
    ['2024-01-01', undefined],
  ])('parses %s without consulting the host locale', (source, expected) => {
    expect(parseItalianDate(source)).toBe(expected);
  });
});

describe('parseItalianAmount', () => {
  it.each([
    ['0', 0],
    ['0,00', 0],
    ['100', 100],
    ['100,5', 100.5],
    ['100,50', 100.5],
    ['1.234,56', 1234.56],
    ['1234567,89', 1234567.89],
  ])('parses strict Italian monetary amount %s', (source, expected) => {
    expect(parseItalianAmount(source)).toBe(expected);
  });

  it.each([
    '-',
    'n.d.',
    '',
    '-1,00',
    '1.00,00',
    '1,234',
    '1 234,56',
    '90.071.992.547.409,92',
    '90.071.992.547.409,91',
  ])('rejects absent, malformed, negative or unsafe amount %s', (source) => {
    expect(parseItalianAmount(source)).toBeUndefined();
  });
});

describe('parseItalianCount', () => {
  it.each([
    ['0', 0],
    ['12', 12],
    ['1.234', 1234],
    ['1234567', 1234567],
  ])('parses strict Italian integer count %s', (source, expected) => {
    expect(parseItalianCount(source)).toBe(expected);
  });

  it.each(['-', 'n.d.', '', '-1', '1,0', '1.00', '9.007.199.254.740.992'])(
    'rejects absent, malformed, negative or unsafe count %s',
    (source) => {
      expect(parseItalianCount(source)).toBeUndefined();
    },
  );
});

describe('parseItalianBoolean', () => {
  it.each([
    ['si', true],
    ['sì', true],
    ['SI', true],
    ['NO', false],
    [' no ', false],
  ])('parses explicit Italian boolean %s', (source, expected) => {
    expect(parseItalianBoolean(source)).toBe(expected);
  });

  it.each(['-', 'n.d.', '', 'true', 'false', 's', 'n'])(
    'does not guess boolean value from %s',
    (source) => {
      expect(parseItalianBoolean(source)).toBeUndefined();
    },
  );
});
