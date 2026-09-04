import { describe, expect, it } from 'vitest';

import { parseExtractedDocument } from '../../src/internal/parse-document.js';
import type { ExtractedPdf, PositionedSpan } from '../../src/internal/model.js';

function span(
  text: string,
  x: number,
  y: number,
  width = text.length * 5,
): PositionedSpan {
  return {
    page: 1,
    text,
    x,
    y,
    width,
    height: 10,
    fontName: 'synthetic',
    hasEol: false,
  };
}

describe('parseExtractedDocument', () => {
  it('keeps clipped sections distinct from the cover with the same page number', () => {
    const pdf: ExtractedPdf = {
      pages: [
        {
          number: 1,
          width: 595,
          height: 842,
          spans: [
            span('VISURA ORDINARIA', 80, 780),
            span('IMPRESA SINTETICA S.R.L.', 80, 750),
            span('Numero REA: RM - 1234567', 312, 520),
            span('4 Amministratori', 32, 400),
            span('Data iscrizione: 01/02/2020', 200, 370),
            span('6 Storia delle modifiche', 32, 300),
            span('Partita IVA: 12345678901', 200, 270),
          ],
        },
      ],
    };
    const result = parseExtractedDocument(pdf);
    expect(result.reaNumber).toBe('RM - 1234567');
    expect(result.registrationDate).toBeUndefined();
    expect(result.vatNumber).toBeUndefined();
  });

  it('normalizes split and inline labels without changing their value boundaries', () => {
    const pdf: ExtractedPdf = {
      pages: [
        {
          number: 1,
          width: 595,
          height: 842,
          spans: [
            span('VISURA ORDINARIA', 80, 780),
            span('IMPRESA SINTETICA S.R.L.', 80, 750),
            span('Ｎｕｍｅｒｏ\u00a0ＲＥＡ  :  RM - 1234567', 312, 520),
            span('Forma', 312, 500, 28),
            span('giuridica', 343, 500, 45),
            span('SOCIETA\u2019 A RESPONSABILITA\u2019 LIMITATA', 437, 500),
          ],
        },
      ],
    };
    expect(parseExtractedDocument(pdf)).toMatchObject({
      reaNumber: 'RM - 1234567',
      legalForm: "SOCIETA' A RESPONSABILITA' LIMITATA",
    });
  });

  it('keeps prepared text local to each parse and leaves source spans intact', () => {
    const spans = [
      span('VISURA ORDINARIA', 80, 780),
      span('IMPRESA SINTETICA S.R.L.', 80, 750),
      span('Numero REA', 312, 520),
      span('RM - 1234567', 437, 520),
    ];
    const pdf: ExtractedPdf = {
      pages: [{ number: 1, width: 595, height: 842, spans }],
    };
    const original = structuredClone(pdf);
    const first = parseExtractedDocument(pdf);
    expect(first.reaNumber).toBe('RM - 1234567');
    expect(pdf).toEqual(original);
    spans[3] = span('MI - 7654321', 437, 520);
    expect(parseExtractedDocument(pdf).reaNumber).toBe('MI - 7654321');
    expect(first.reaNumber).toBe('RM - 1234567');
  });

  it('reads separate capital cells across the page midpoint', () => {
    const pdf: ExtractedPdf = {
      pages: [
        {
          number: 1,
          width: 595,
          height: 842,
          spans: [
            span('VISURA ORDINARIA', 80, 780),
            span('Capitale sociale in Euro', 87, 590),
            span('Deliberato:', 252, 590, 50),
            span('30.000,00', 320, 590),
            span('Sottoscritto:', 252, 575, 58),
            span('20.000,00', 319, 575),
            span('Versato:', 252, 560, 40),
            span('10.000,00', 320, 560),
          ],
        },
      ],
    };
    expect(parseExtractedDocument(pdf).shareCapital).toEqual({
      currency: 'EUR',
      authorized: 30000,
      subscribed: 20000,
      paidUp: 10000,
    });
  });

  it('reads capital amounts only from the dedicated euro capital table', () => {
    const pdf: ExtractedPdf = {
      pages: [
        {
          number: 1,
          width: 595,
          height: 842,
          spans: [
            span('VISURA ORDINARIA', 80, 780),
            span('Versato: 500,00', 200, 700),
            span('3 Capitale e strumenti finanziari', 32, 620),
            span('Capitale sociale in Euro', 40, 590),
            span('Deliberato: 30.000,00', 200, 590),
            span('Sottoscritto: 20.000,00', 200, 577),
            span('Versato: 10.000,00', 200, 564),
            span('4 Soci e titolari di diritti su azioni e quote', 32, 520),
            span('Versato: 700,00', 200, 480),
          ],
        },
      ],
    };
    expect(parseExtractedDocument(pdf).shareCapital).toEqual({
      currency: 'EUR',
      authorized: 30000,
      subscribed: 20000,
      paidUp: 10000,
    });
  });

  it('does not fill an absent capital amount from a shareholder payment', () => {
    const pdf: ExtractedPdf = {
      pages: [
        {
          number: 1,
          width: 595,
          height: 842,
          spans: [
            span('VISURA ORDINARIA', 80, 780),
            span('Capitale sociale in Euro', 40, 590),
            span('Deliberato: 30.000,00', 200, 590),
            span('Sottoscritto: 20.000,00', 200, 577),
            span('4 Soci e titolari di diritti su azioni e quote', 32, 520),
            span('Versato: 700,00', 200, 480),
          ],
        },
      ],
    };
    expect(parseExtractedDocument(pdf).shareCapital).toEqual({
      currency: 'EUR',
      authorized: 30000,
      subscribed: 20000,
    });
  });

  it('omits capital details when there is no dedicated euro capital table', () => {
    const pdf: ExtractedPdf = {
      pages: [
        {
          number: 1,
          width: 595,
          height: 842,
          spans: [
            span('VISURA ORDINARIA', 80, 700),
            span('Versato: 700,00', 200, 500),
          ],
        },
      ],
    };
    expect(parseExtractedDocument(pdf).shareCapital).toBeUndefined();
  });

  it('does not let historical entries populate current roles or capital', () => {
    const pdf: ExtractedPdf = {
      pages: [
        {
          number: 1,
          width: 595,
          height: 842,
          spans: [
            span('VISURA STORICA', 80, 700),
            span('Amministratore Unico', 25, 500, 110),
            span('GIULIA VERDI', 149, 500, 80),
            span('6 Storia delle modifiche', 32, 300, 160),
            span('Amministratore Unico', 25, 250, 110),
            span('MARIO ROSSI', 149, 250, 80),
            span('Capitale sociale in Euro', 40, 200),
            span('Deliberato: 30.000,00', 200, 200),
            span('Sottoscritto: 20.000,00', 200, 185),
            span('Versato: 10.000,00', 200, 170),
          ],
        },
      ],
    };
    expect(parseExtractedDocument(pdf).officers).toEqual([
      { name: 'GIULIA VERDI', roles: ['Amministratore Unico'] },
    ]);
    expect(parseExtractedDocument(pdf).shareCapital).toBeUndefined();
  });

  it('reconstructs wrapped cover labels without flattening neighboring values', () => {
    const pdf: ExtractedPdf = {
      pages: [
        {
          number: 1,
          width: 595,
          height: 842,
          spans: [
            span('VISURA ORDINARIA', 80, 700),
            span('Soci e titolari di diritti su', 312, 500, 105),
            span('azioni e quote', 312, 490, 70),
            span('3', 436, 500, 6),
            span('Pratiche inviate negli', 312, 460, 100),
            span('ultimi 12 mesi', 312, 450, 70),
            span('4', 436, 460, 6),
          ],
        },
      ],
    };
    expect(parseExtractedDocument(pdf)).toMatchObject({
      companySummary: { shareholdersCount: 3, filingsLast12Months: 4 },
    });
  });

  it('bounds wrapped values at the next label instead of consuming its value', () => {
    const pdf: ExtractedPdf = {
      pages: [
        {
          number: 1,
          width: 595,
          height: 842,
          spans: [
            span('VISURA ORDINARIA', 80, 700),
            span('Forma giuridica', 312, 500, 80),
            span('impresa individuale', 436, 500, 100),
            span('Data iscrizione', 312, 487, 80),
            span('05/12/2017', 436, 487, 70),
          ],
        },
      ],
    };
    expect(parseExtractedDocument(pdf)).toMatchObject({
      legalForm: 'impresa individuale',
      registrationDate: '2017-12-05',
    });
  });

  it('reads an evasion heading, wrapped business name, and short address label', () => {
    const pdf: ExtractedPdf = {
      pages: [
        {
          number: 1,
          width: 595,
          height: 842,
          spans: [
            {
              ...span('ESITO EVASIONE PROTOCOLLO 1/2025', 83, 588, 300),
              height: 13,
            },
            { ...span('IMPRESA SINTETICA', 83, 541, 160), height: 14 },
            { ...span('S.R.L.', 83, 525, 55), height: 14 },
            span('DATI ANAGRAFICI', 312, 544),
            span('Indirizzo Sede', 312, 531, 95),
            span('ROMA (RM)', 436, 531, 90),
            span('VIA ESEMPIO 1', 436, 521, 100),
            span('Numero REA', 312, 493, 60),
            span('RM - 1234567', 436, 493, 70),
            span('Visura camerale', 14, 14, 80),
          ],
        },
      ],
    };

    expect(parseExtractedDocument(pdf)).toMatchObject({
      reportType: 'Visura di Evasione',
      companyName: 'IMPRESA SINTETICA S.R.L.',
      registeredOfficeAddress: 'ROMA (RM) VIA ESEMPIO 1',
    });
  });

  it('does not classify an ordinary report from historical words in its body', () => {
    const pdf: ExtractedPdf = {
      pages: [
        {
          number: 1,
          width: 595,
          height: 842,
          spans: [span('VISURA ORDINARIA', 80, 700)],
        },
        {
          number: 2,
          width: 595,
          height: 842,
          spans: [span('Visura storica e pratiche', 80, 700)],
        },
      ],
    };
    expect(parseExtractedDocument(pdf).reportType).toBe('VISURA ORDINARIA');
  });

  it('includes ATECO 2025 rows in the general classifications array', () => {
    const pdf: ExtractedPdf = {
      pages: [
        {
          number: 1,
          width: 595,
          height: 842,
          spans: [
            span('VISURA ORDINARIA', 80, 700),
            span('Classificazione ATECO 2025', 25, 500),
            span('62.10', 25, 480),
          ],
        },
      ],
    };
    expect(parseExtractedDocument(pdf).activity?.atecoClassifications).toEqual([
      { code: '62.10' },
    ]);
  });

  it('reconstructs split role labels before assigning names', () => {
    const pdf: ExtractedPdf = {
      pages: [
        {
          number: 1,
          width: 595,
          height: 842,
          spans: [
            span('VISURA ORDINARIA', 80, 700, 110),
            span('IMPRESA SINTETICA S.P.A.', 80, 665, 160),
            span('Presidente Consiglio', 25, 400, 100),
            span('Amministrazione', 130, 400, 80),
            span('GIULIA VERDI', 220, 400, 75),
          ],
        },
      ],
    };

    expect(parseExtractedDocument(pdf)).toMatchObject({
      officers: [
        {
          name: 'GIULIA VERDI',
          roles: ['Presidente Consiglio Amministrazione'],
        },
      ],
    });
  });
});
