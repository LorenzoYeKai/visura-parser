import { describe, expect, it } from 'vitest';
import { parseExtractedDocument } from '../../src/internal/parse-document.js';
import type {
  ExtractedPage,
  PositionedSpan,
} from '../../src/internal/model.js';

function span(
  text: string,
  x: number,
  y: number,
  width = text.length * 4,
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
function page(spans: PositionedSpan[], number = 1): ExtractedPage {
  return { number, width: 595, height: 842, spans };
}
function parse(spans: PositionedSpan[]) {
  return parseExtractedDocument({
    pages: [page([span('VISURA ORDINARIA', 80, 780), ...spans])],
  });
}

describe('new schema semantics', () => {
  it('converts summary values and keeps the dates attached to their own labels', () => {
    const result = parse([
      span('Addetti al 31/12/2024', 312, 700, 112),
      span('1.234', 440, 700),
      span('Documenti RI dal 05/12/2017', 312, 670, 115),
      span('24', 440, 670),
      span('Soci', 312, 640),
      span('3', 440, 640),
      span('Amministratori', 312, 610),
      span('0', 440, 610),
      span('Unita locali', 312, 580),
      span('-', 440, 580),
      span('Partecipazioni', 312, 550),
      span('si', 440, 550),
      span('Fascicolo', 312, 520),
      span('si', 440, 520),
      span('Statuto', 312, 490),
      span('no', 440, 490),
      span('Altri atti', 312, 460),
      span('19', 440, 460),
      span('Bilanci', 312, 430),
      span('2024, 2022, 2021 ...', 440, 430),
      span('Certificazioni di qualita', 312, 400, 115),
      span('ISO 9001:2015', 440, 400),
    ]);
    expect(result).toEqual({
      reportType: 'VISURA ORDINARIA',
      employees: { count: 1234, referenceDate: '2024-12-31' },
      businessRegisterFilings: { count: 24, sinceDate: '2017-12-05' },
      companySummary: {
        shareholdersCount: 3,
        directorsCount: 0,
        hasEquityInterests: true,
      },
      availableDocuments: {
        companyFileAvailable: true,
        articlesOfAssociationAvailable: false,
        otherActsCount: 19,
        financialStatementYears: [2024, 2022, 2021],
      },
      certifications: { quality: ['ISO 9001:2015'] },
    });
  });

  it('does not guess numeric or boolean values from absence markers', () => {
    expect(
      parse([
        span('Soci', 312, 700),
        span('-', 440, 700),
        span('Addetti al 31/02/2024', 312, 670, 110),
        span('n.d.', 440, 670),
        span('Fascicolo', 312, 640),
        span('-', 440, 640),
        span('Bilanci', 312, 610),
        span('2024-2021', 440, 610),
      ]),
    ).toEqual({ reportType: 'VISURA ORDINARIA' });
  });

  it('preserves multiple Italian officer roles with the person tax code', () => {
    const result = parse([
      span('Amministratore Unico', 25, 700, 110),
      span('MARIO ROSSI', 150, 700),
      span('Codice fiscale: RSSMRA80A01F205X', 150, 680),
      span('Amministratore Delegato', 150, 650),
      span('4 Sindaci, membri organi di controllo', 25, 600),
      span('Sindaco Supplente', 25, 570),
      span('ANNA VERDI', 150, 570),
    ]);
    expect(result.primaryRepresentative).toEqual({
      name: 'MARIO ROSSI',
      role: 'Amministratore Unico',
    });
    expect(result.officers).toEqual([
      {
        name: 'MARIO ROSSI',
        taxCode: 'RSSMRA80A01F205X',
        roles: ['Amministratore Unico', 'Amministratore Delegato'],
      },
      { name: 'ANNA VERDI', roles: ['Sindaco Supplente'] },
    ]);
  });

  it('keeps personal tax codes attached to names when birthplace cells are split', () => {
    const result = parse([
      span('Amministratore Unico', 25, 700, 110),
      span('MARIO ROSSI', 150, 700),
      span('Nato a', 25, 680),
      span('ROMA (RM)', 150, 680),
      span('Codice fiscale', 25, 660),
      span('RSSMRA80A01F205X', 150, 660),
    ]);
    expect(result.officers).toEqual([
      {
        name: 'MARIO ROSSI',
        taxCode: 'RSSMRA80A01F205X',
        roles: ['Amministratore Unico'],
      },
    ]);
  });

  it('does not read ownership amounts beyond a section boundary', () => {
    const result = parse([
      span("Proprieta'", 25, 700),
      span('ALFA HOLDING S.R.L.', 25, 680),
      span('4 Amministratori', 25, 660),
      span('Valore nominale: 99.000,00 Euro', 25, 640),
      span('Presidente', 25, 610),
      span('MARIO ROSSI', 150, 610),
    ]);
    expect(result.shareholders).toEqual([
      { name: 'ALFA HOLDING S.R.L.', rightType: "Proprieta'" },
    ]);
    expect(result.primaryRepresentative).toBeUndefined();
  });

  it('does not make a sole proprietor a shareholder', () => {
    const result = parse([
      span('Titolare', 25, 700),
      span('ANNA VERDI', 150, 700),
    ]);
    expect(result.officers).toEqual([
      { name: 'ANNA VERDI', roles: ['Titolare'] },
    ]);
    expect(result.shareholders).toBeUndefined();
  });

  it('does not invent a summary representative from a later-page president', () => {
    const result = parseExtractedDocument({
      pages: [
        page([span('VISURA ORDINARIA', 80, 780)]),
        page([span('Presidente', 25, 700), span('MARIO ROSSI', 150, 700)], 2),
      ],
    });
    expect(result.officers).toEqual([
      { name: 'MARIO ROSSI', roles: ['Presidente'] },
    ]);
    expect(result.primaryRepresentative).toBeUndefined();
  });

  it('reads ownership rights and nominal values without using paid amounts', () => {
    const result = parse([
      span("Proprieta'", 25, 700),
      span('ALFA HOLDING S.R.L.', 25, 680),
      span('Codice fiscale: 12345678901', 25, 660),
      span('Valore nominale: 25.000,50 Euro', 25, 640),
      span('50,25%', 25, 620),
      span('Versato: 1.000,00', 25, 600),
      span('Usufrutto', 25, 560),
      span('ANNA VERDI', 25, 540),
      span('Codice fiscale: VRDNNA82E55F205Z', 25, 520),
      span('Valore nominale: 10.000,00 Euro', 25, 500),
    ]);
    expect(result.shareholders).toEqual([
      {
        name: 'ALFA HOLDING S.R.L.',
        taxCode: '12345678901',
        rightType: "Proprieta'",
        nominalValue: 25000.5,
        currency: 'EUR',
        ownershipPercentage: 50.25,
      },
      {
        name: 'ANNA VERDI',
        taxCode: 'VRDNNA82E55F205Z',
        rightType: 'Usufrutto',
        nominalValue: 10000,
        currency: 'EUR',
      },
    ]);
    expect(result.shareCapital).toBeUndefined();
  });

  it('merges an explicit sole-shareholder role into the same ownership record', () => {
    const result = parse([
      span('Socio Unico', 25, 740),
      span('MARIO ROSSI', 150, 740),
      span("Proprieta'", 25, 700),
      span('MARIO ROSSI', 25, 680),
      span('Codice fiscale: RSSMRA80A01F205X', 25, 660),
      span('Valore nominale: 25.000,00 Euro', 25, 640),
    ]);
    expect(result.shareholders).toEqual([
      {
        name: 'MARIO ROSSI',
        taxCode: 'RSSMRA80A01F205X',
        rightType: "Proprieta'",
        nominalValue: 25000,
        currency: 'EUR',
        isSoleShareholder: true,
      },
    ]);
  });

  it('keeps homonymous officers with different tax codes separate', () => {
    const result = parse([
      span('Amministratore', 25, 740),
      span('MARIO ROSSI', 150, 740),
      span('Codice fiscale: RSSMRA80A01F205X', 150, 720),
      span('Sindaco', 25, 650),
      span('MARIO ROSSI', 150, 650),
      span('Codice fiscale: RSSMRA81A01F205X', 150, 630),
    ]);
    expect(result.officers).toEqual([
      {
        name: 'MARIO ROSSI',
        taxCode: 'RSSMRA80A01F205X',
        roles: ['Amministratore'],
      },
      { name: 'MARIO ROSSI', taxCode: 'RSSMRA81A01F205X', roles: ['Sindaco'] },
    ]);
  });

  it('parses qualifiers in ATECO 2025 and stops before unrelated codes', () => {
    expect(
      parse([
        span('Classificazione ATECO 2025', 25, 700),
        span('Codice: 62.10.00 - PRODUZIONE SOFTWARE', 25, 680),
        span('Importanza: primaria', 25, 665),
        span('Codice: 62.20.10', 25, 645),
        span('CONSULENZA INFORMATICA', 25, 630),
        span('secondaria', 25, 615),
        span('Codice NACE', 25, 590),
        span('99.99', 150, 590),
      ]).activity?.atecoClassifications,
    ).toEqual([
      {
        code: '62.10.00',
        description: 'PRODUZIONE SOFTWARE',
        importance: 'primaria',
      },
      {
        code: '62.20.10',
        description: 'CONSULENZA INFORMATICA',
        importance: 'secondaria',
      },
    ]);
  });
});
