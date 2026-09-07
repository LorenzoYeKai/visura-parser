import { describe, expect, it } from 'vitest';

import { parseLocalUnits } from '../../src/internal/parse-local-units.js';
import type {
  ExtractedPage,
  ExtractedPdf,
  PositionedSpan,
} from '../../src/internal/model.js';

function span(
  page: number,
  text: string,
  x: number,
  y: number,
  width = text.length * 5,
): PositionedSpan {
  return {
    page,
    text,
    x,
    y,
    width,
    height: 10,
    fontName: 'synthetic',
    hasEol: false,
  };
}

function page(number: number, spans: PositionedSpan[]): ExtractedPage {
  return { number, width: 595, height: 842, spans };
}

describe('parseLocalUnits', () => {
  it('parses ordered records across pages without treating the cover count as a record', () => {
    const pdf: ExtractedPdf = {
      pages: [
        page(1, [
          span(1, 'VISURA ORDINARIA', 80, 780),
          span(1, "Unita' locali", 312, 500),
          span(1, '2', 440, 500),
        ]),
        page(2, [
          span(2, "7 Sedi secondarie ed unita' locali", 32, 720),
          span(2, "Unita' Locale n. le / 1", 37, 690),
          span(2, 'PUNTO VENDITA', 37, 670),
          span(2, 'Data apertura: 05/12/2017', 202, 670),
          span(2, 'Indirizzo', 37, 650),
          span(2, 'ROMA (RM)', 202, 650),
          span(2, 'VIA ESEMPIO', 202, 630),
        ]),
        page(3, [
          span(3, '1 - 00100', 202, 740),
          span(3, 'estremi di iscrizione', 37, 720),
          span(
            3,
            'Numero Repertorio Economico Amministrativo: LE - 123456',
            202,
            720,
          ),
          span(3, "Attivita' esercitata", 37, 700),
          span(3, 'COMMERCIO AL DETTAGLIO', 202, 680),
          span(3, "Attivita' secondaria esercitata", 37, 670),
          span(3, 'RISTORAZIONE', 202, 665),
          span(3, "Classificazione ATECO 2025 dell'attivita'", 37, 660),
          span(3, 'Codice: 47.11.00', 37, 640),
          span(3, "Unita' Locale n. LE/2", 37, 600),
          span(3, 'Indirizzo: MILANO (MI) VIA PROVA 2 - 20100', 37, 580),
          span(3, '8 Aggiornamento impresa', 32, 540),
          span(3, "Attivita' esercitata: NON CORRELATA", 37, 520),
        ]),
      ],
    };

    expect(parseLocalUnits(pdf)).toEqual([
      {
        number: 'LE/1',
        address: 'ROMA (RM) VIA ESEMPIO 1 - 00100',
        openingDate: '2017-12-05',
        reaNumber: 'LE - 123456',
        primaryActivity: 'COMMERCIO AL DETTAGLIO',
      },
      {
        number: 'LE/2',
        address: 'MILANO (MI) VIA PROVA 2 - 20100',
      },
    ]);
  });
});
