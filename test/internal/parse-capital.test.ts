import { describe, expect, it } from 'vitest';

import type {
  ExtractedPage,
  PositionedSpan,
} from '../../src/internal/model.js';
import { parseCapital } from '../../src/internal/parse-capital.js';

function tablePage(lines: readonly string[]): ExtractedPage {
  const spans: PositionedSpan[] = lines.map((text, index) => ({
    page: 1,
    text,
    x: 40,
    y: 600 - index * 15,
    width: text.length * 5,
    height: 10,
    fontName: 'synthetic',
    hasEol: false,
  }));
  return { number: 1, width: 595, height: 842, spans };
}

describe('parseCapital', () => {
  it('handles a wrapped heading and omits printed absence markers', () => {
    const page = tablePage([
      'Capitale sociale in',
      'Euro',
      'Deliberato: 0,00',
      'Sottoscritto: -',
      'Versato: n.d.',
    ]);
    expect(parseCapital({ pages: [page] })).toEqual({
      currency: 'EUR',
      authorized: 0,
    });
  });

  it('leaves a blank amount absent without borrowing from the next row', () => {
    const page = tablePage([
      'Capitale sociale in Euro',
      'Deliberato:',
      'Sottoscritto: 20.000,00',
      'Versato: 10.000,00',
    ]);
    expect(parseCapital({ pages: [page] })).toEqual({
      currency: 'EUR',
      subscribed: 20000,
      paidUp: 10000,
    });
  });

  it.each([
    'Soci e titolari di diritti su azioni e quote',
    'Conferimenti in denaro',
    'Versato per la quota del socio: 100,00',
    'Versato: 1.00,00',
  ])('stops at an unrelated or invalid row: %s', (boundary) => {
    const page = tablePage([
      'Capitale sociale in Euro',
      'Deliberato: 30.000,00',
      'Sottoscritto: 20.000,00',
      boundary,
      'Versato: 100,00',
    ]);
    expect(parseCapital({ pages: [page] })).toEqual({
      currency: 'EUR',
      authorized: 30000,
      subscribed: 20000,
    });
  });

  it('does not infer euro capital from the cover total or another currency', () => {
    const page = tablePage([
      'Capitale sociale',
      'Deliberato: 30.000,00',
      'Capitale sociale in Lire',
      'Sottoscritto: 20.000,00',
    ]);
    expect(parseCapital({ pages: [page] })).toBeUndefined();
  });

  it('does not borrow payments from another page', () => {
    const page = tablePage([
      'Capitale sociale in Euro',
      'Deliberato: 30.000,00',
    ]);
    const next = tablePage(['Versato: 100,00']);
    expect(parseCapital({ pages: [page, { ...next, number: 2 }] })).toEqual({
      currency: 'EUR',
      authorized: 30000,
    });
  });
});
