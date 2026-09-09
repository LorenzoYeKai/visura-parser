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
  height = 10,
): PositionedSpan {
  return {
    page: 1,
    text,
    x,
    y,
    width,
    height,
    fontName: 'synthetic',
    hasEol: false,
  };
}

function page(number: number, spans: PositionedSpan[]): ExtractedPage {
  return {
    number,
    width: 595,
    height: 842,
    spans: spans.map((s) => ({ ...s, page: number })),
  };
}

// Synthetic values with the column placement and wrapping of an evasion report.
const cover = page(1, [
  span('ESITO EVASIONE PROTOCOLLO 12345/2025 DEL', 83, 590, 311, 13),
  span('05/06/2025', 83, 575, 65, 13),
  span("IMPRESA ESEMPIO SOCIETA'", 83, 543, 200, 14),
  span("A RESPONSABILITA'", 83, 527, 141, 14),
  span('LIMITATA SEMPLIFICATA', 83, 511, 173, 14),
  span('DATI ANAGRAFICI', 312, 546),
  span('Forma giuridica', 312, 459, 69),
  span("societa' a responsabilita'", 436, 459, 108),
  span('limitata semplificata', 436, 449, 87),
  span('Amministratore Unico', 312, 436, 96),
  span('MARIO ROSSI', 436, 436, 60),
  span("Rappresentante dell'Impresa", 436, 424, 102),
  span('Esito evasione protocollo disponibile nel cassetto', 77, 313, 300, 8),
  span("digitale dell'imprenditore all'indirizzo", 77, 305, 429, 8),
  span('Visura camerale', 14, 14, 80, 8),
]);

const constitution = page(2, [
  span('1', 32, 559),
  span('Informazioni da statuto/atto costitutivo', 44, 559),
  span('Registro Imprese', 87, 541),
  span('Data di iscrizione: 05/06/2025', 254, 526),
  span('Data atto di costituzione: 30/05/2025', 254, 496),
  span('sistema di amministrazione e controllo', 37, 119),
  span('amministratore unico', 202, 86, 92),
  span('(in carica)', 296, 86, 40),
]);

const ownership = page(3, [
  span('3', 32, 384),
  span('Soci e titolari di diritti su azioni e quote', 44, 384),
  span("Proprieta'", 37, 238),
  span('Quota di nominali: 4.800,00 Euro', 202, 241),
  span('Di cui versati: 4.800,00', 202, 228),
  span('MARIO ROSSI', 37, 215),
  span('Codice fiscale: RSSMRA80A01F205X', 202, 215),
  span("Tipo di diritto: proprieta'", 202, 189),
  span('Domicilio del titolare o rappresentante comune', 202, 176),
]);

const governance = page(4, [
  span('4', 32, 729),
  span('Amministratori', 44, 729),
  span('Amministratore Unico', 87, 700, 104),
  span('MARIO ROSSI', 255, 700),
  span('carica', 37, 643),
  span('amministratore unico', 37, 630),
  span('Numero componenti: 1', 202, 630),
  span('Amministratore Unico', 37, 572),
  span('MARIO ROSSI', 37, 559),
  span('Nato a ROMA (RM) il 01/01/1980', 202, 559),
  span('Codice fiscale: RSSMRA80A01F205X', 202, 533),
  span('carica', 37, 455),
  span('amministratore unico', 202, 455),
  span('Data atto di nomina: 30/05/2025', 202, 442),
  span('Data iscrizione: 05/06/2025', 202, 429),
  span('Durata in carica: fino alla revoca', 202, 416),
  span('carica', 37, 377),
  span('socio unico', 202, 377),
  span('dal 30/05/2025', 202, 364),
  span('Data iscrizione: 05/06/2025', 202, 351),
  span('5', 32, 322),
  span('Attività, albi ruoli e licenze', 44, 322),
  span('Stato attività', 87, 299),
  span('Impresa INATTIVA', 252, 299),
]);

describe('evasion report layout', () => {
  const parse = () =>
    parseExtractedDocument({
      pages: [cover, constitution, ownership, governance],
    });

  it('reads the full three-line company name beneath the document title', () => {
    expect(parse().companyName).toBe(
      "IMPRESA ESEMPIO SOCIETA' A RESPONSABILITA' LIMITATA SEMPLIFICATA",
    );
  });

  it('ends the legal form before the representative row', () => {
    expect(parse().legalForm).toBe(
      "societa' a responsabilita' limitata semplificata",
    );
  });

  it('reads inline constitution dates and activity status from the body', () => {
    expect(parse()).toMatchObject({
      incorporationDate: '2025-05-30',
      registrationDate: '2025-06-05',
      activity: { status: 'Impresa INATTIVA' },
    });
  });

  it('attaches detail roles to the person, excluding administrative body descriptions', () => {
    expect(parse().officers).toEqual([
      {
        name: 'MARIO ROSSI',
        taxCode: 'RSSMRA80A01F205X',
        birthDate: '1980-01-01',
        birthPlace: 'ROMA',
        birthProvince: 'RM',
        roles: ['Amministratore Unico'],
      },
    ]);
  });

  it('keeps the ownership right, quota, tax code and sole-shareholder role together', () => {
    expect(parse().shareholders).toEqual([
      {
        name: 'MARIO ROSSI',
        taxCode: 'RSSMRA80A01F205X',
        birthDate: '1980-01-01',
        birthPlace: 'ROMA',
        birthProvince: 'RM',
        rightType: "proprieta'",
        nominalValue: 4800,
        currency: 'EUR',
        isSoleShareholder: true,
      },
    ]);
  });

  it('does not substitute officer registration dates for a missing company registration date', () => {
    const result = parseExtractedDocument({ pages: [cover, governance] });
    expect(result.registrationDate).toBeUndefined();
  });

  it('does not read protocol filing details as current people or capital', () => {
    const result = parseExtractedDocument({
      pages: [
        cover,
        page(2, [
          span('7', 32, 400),
          span('Protocollo evaso', 44, 400),
          span('Amministratore Unico', 37, 350),
          span('ANNA VERDI', 202, 350),
          span('Capitale sociale in Euro', 87, 300),
          span('Deliberato: 99.000,00', 252, 300),
        ]),
      ],
    });
    expect(result.officers).toEqual([
      { name: 'MARIO ROSSI', roles: ['Amministratore Unico'] },
    ]);
    expect(result.shareCapital).toBeUndefined();
  });

  it.each(['Firmatario', 'Firmataria'])(
    'recognizes wrapped proprietor labels and the detailed %s role',
    (signatory) => {
      const result = parseExtractedDocument({
        pages: [
          page(1, [
            span('ESITO EVASIONE PROTOCOLLO 1/2025', 83, 590),
            span('IMPRESA ESEMPIO', 83, 543, 180, 14),
            span('Forma giuridica', 312, 457),
            span('impresa individuale', 436, 457),
            span('Titolare di impresa', 312, 444),
            span('individuale', 312, 434),
            span('ANNA VERDI', 436, 444),
            span('Visura camerale', 14, 14),
          ]),
          page(2, [
            span('2 Titolari di cariche o qualifiche', 32, 294),
            span(`Titolare ${signatory}`, 37, 216),
            span('ANNA VERDI', 37, 203),
            span('Nata a ROMA (RM)', 202, 203),
            span('Codice fiscale: VRDNNA82E55F205Z', 202, 190),
            span('carica', 37, 125),
            span(`titolare ${signatory.toLowerCase()}`, 202, 125),
            span('carica', 37, 99),
            span('preposto alla somministrazione', 202, 99),
          ]),
        ],
      });
      expect(result.legalForm).toBe('impresa individuale');
      expect(result.primaryRepresentative).toEqual({
        name: 'ANNA VERDI',
        role: 'Titolare di impresa individuale',
      });
      expect(result.officers).toEqual([
        {
          name: 'ANNA VERDI',
          taxCode: 'VRDNNA82E55F205Z',
          birthPlace: 'ROMA',
          birthProvince: 'RM',
          roles: ['Titolare di impresa individuale', `Titolare ${signatory}`],
        },
      ]);
      expect(result.shareholders).toBeUndefined();
    },
  );

  it('recognizes a female managing partner and keeps her out of the legal form', () => {
    const result = parseExtractedDocument({
      pages: [
        page(1, [
          span('ESITO EVASIONE PROTOCOLLO 1/2025', 83, 590),
          span('IMPRESA ESEMPIO S.A.S.', 83, 543, 180, 14),
          span('Forma giuridica', 312, 457),
          span("societa' in accomandita", 436, 457),
          span('semplice', 436, 447),
          span('Socia Accomandataria', 312, 434),
          span('ANNA VERDI', 436, 434),
          span("Rappresentante dell'Impresa", 436, 422),
          span('Visura camerale', 14, 14),
        ]),
      ],
    });
    expect(result.legalForm).toBe("societa' in accomandita semplice");
    expect(result.primaryRepresentative).toEqual({
      name: 'ANNA VERDI',
      role: 'Socia Accomandataria',
    });
    expect(result.officers).toEqual([
      { name: 'ANNA VERDI', roles: ['Socia Accomandataria'] },
    ]);
    expect(result.shareholders).toEqual([{ name: 'ANNA VERDI' }]);
  });

  it('does not extract officers from the statute or its continuation page', () => {
    const result = parseExtractedDocument({
      pages: [
        cover,
        page(2, [
          span('1 Informazioni da statuto/atto costitutivo', 32, 700),
          span('amministratore unico', 202, 130),
          span('(in carica)', 296, 130),
          span('OGGETTO SOCIALE DELLA SOCIETA', 199, 101, 300, 7),
        ]),
        page(3, [
          span('poteri associati alla carica di', 40, 492),
          span('Amministratore Unico', 40, 482),
          span('COMPIE GLI ATTI DI GESTIONE DELLA SOCIETA', 202, 482, 300, 7),
        ]),
      ],
    });
    expect(result.officers).toEqual([
      { name: 'MARIO ROSSI', roles: ['Amministratore Unico'] },
    ]);
  });

  it('does not mistake a wrapped president role for a person name', () => {
    const result = parseExtractedDocument({
      pages: [
        page(1, [
          span('VISURA DI EVASIONE', 83, 780),
          span('4 Amministratori', 32, 612),
          span('Presidente Consiglio', 87, 583),
          span('Amministrazione', 87, 571),
          span('ANNA VERDI', 255, 583),
          span('Presidente Consiglio', 37, 428, 120, 11),
          span('Amministrazione', 37, 415, 110, 11),
          span('ANNA VERDI', 37, 402),
          span('Nata a ROMA (RM)', 202, 402),
          span('Codice fiscale: VRDNNA82E55F205Z', 202, 389),
        ]),
      ],
    });
    expect(result.officers).toEqual([
      {
        name: 'ANNA VERDI',
        taxCode: 'VRDNNA82E55F205Z',
        birthPlace: 'ROMA',
        birthProvince: 'RM',
        roles: ['Presidente Consiglio Amministrazione'],
      },
    ]);
  });

  it('keeps adjacent summary names separate when each row has its own role', () => {
    const result = parseExtractedDocument({
      pages: [
        page(1, [
          span('VISURA DI EVASIONE', 83, 780),
          span('4 Amministratori', 32, 612),
          span('Amministratore Unico', 87, 583, 110),
          span('ANNA VERDI', 255, 583),
          span('Consigliere', 87, 568),
          span('MARIO ROSSI', 255, 568),
        ]),
      ],
    });
    expect(result.officers).toEqual([
      { name: 'ANNA VERDI', roles: ['Amministratore Unico'] },
      { name: 'MARIO ROSSI', roles: ['Consigliere'] },
    ]);
  });

  it('joins a shareholder record across pages and preserves wrapped names', () => {
    const result = parseExtractedDocument({
      pages: [
        cover,
        page(2, [
          span('3 Soci e titolari di diritti su azioni e quote', 32, 300),
          span("Proprieta'", 37, 73, 60, 11),
          span('Quota di nominali: 4.800,00 Euro', 202, 76),
          span('Di cui versati: 4.800,00', 202, 63),
          span('Esito evasione protocollo 1/2025', 28, 34),
        ]),
        page(3, [
          span('Registro Imprese', 28, 793),
          span('IMPRESA ESEMPIO', 297, 791),
          span('MARIA ANNA', 37, 745),
          span('VERDI', 37, 735),
          span('Codice fiscale: VRDNNA82E55F205Z', 202, 745),
          span("Tipo di diritto: proprieta'", 202, 719),
          span('4 Amministratori', 32, 651),
        ]),
      ],
    });
    expect(result.shareholders).toEqual([
      {
        name: 'MARIA ANNA VERDI',
        taxCode: 'VRDNNA82E55F205Z',
        rightType: "proprieta'",
        nominalValue: 4800,
        currency: 'EUR',
      },
    ]);
  });

  it('does not overwrite a quota with the amount above the next ownership heading', () => {
    const result = parseExtractedDocument({
      pages: [
        page(1, [
          span('VISURA DI EVASIONE', 83, 780),
          span('3 Soci e titolari di diritti su azioni e quote', 32, 650),
          span("Proprieta'", 37, 596),
          span('Quota di nominali: 3.000,00 Euro', 202, 599),
          span('ANNA VERDI', 37, 573),
          span('Codice fiscale: VRDNNA82E55F205Z', 202, 573),
          span("Proprieta'", 37, 492),
          span('Quota di nominali: 7.000,00 Euro', 202, 495),
          span('MARIO ROSSI', 37, 469),
          span('Codice fiscale: RSSMRA80A01F205X', 202, 469),
        ]),
      ],
    });
    expect(result.shareholders?.map((person) => person.nominalValue)).toEqual([
      3000, 7000,
    ]);
  });

  it('attaches a sole-shareholder role on the following page to the officer', () => {
    const result = parseExtractedDocument({
      pages: [
        cover,
        page(2, [
          span('4 Amministratori', 32, 328),
          span('Amministratore Unico', 37, 171),
          span('MARIO ROSSI', 37, 158),
          span('Codice fiscale: RSSMRA80A01F205X', 202, 132),
          span('domicilio', 37, 106),
          span('ROMA (RM)', 202, 106),
          span('VIA ESEMPIO 1', 202, 93),
        ]),
        page(3, [
          span('Registro Imprese', 28, 793),
          span('carica', 37, 745),
          span('amministratore unico', 202, 745),
          span('Data iscrizione: 05/06/2025', 202, 719),
          span('carica', 37, 667),
          span('socio unico', 202, 667),
          span('dal 30/05/2025', 202, 654),
          span('5 Attivita, albi ruoli e licenze', 32, 600),
        ]),
      ],
    });
    expect(result.officers).toEqual([
      {
        name: 'MARIO ROSSI',
        taxCode: 'RSSMRA80A01F205X',
        roles: ['Amministratore Unico'],
      },
    ]);
    expect(result.shareholders).toEqual([
      {
        name: 'MARIO ROSSI',
        taxCode: 'RSSMRA80A01F205X',
        isSoleShareholder: true,
      },
    ]);
  });

  it('reads body activity rows across the midpoint, wrapped labels and page breaks', () => {
    const result = parseExtractedDocument({
      pages: [
        cover,
        page(2, [
          span('5 Attivita, albi ruoli e licenze', 32, 150),
          span("Data inizio dell'attivita'", 87, 123),
          span("dell'impresa", 87, 111),
          span('05/06/2025', 252, 123),
          span('Attivita prevalente', 87, 96),
          span('COMMERCIO', 252, 98),
          span('DI PRODOTTI', 310, 98),
          span('ALIMENTARI', 252, 88),
          span('E BEVANDE', 252, 78),
          span('Esito evasione protocollo 1/2025', 28, 34),
        ]),
        page(3, [
          span('Registro Imprese', 28, 793),
          span('AL DETTAGLIO', 252, 745),
          span('Attivita', 37, 711),
          span('attivita prevalente esercitata', 37, 685),
          span(
            'COMMERCIO DI PRODOTTI ALIMENTARI E BEVANDE AL DETTAGLIO',
            199,
            685,
          ),
        ]),
      ],
    });
    expect(result.activity).toMatchObject({
      startDate: '2025-06-05',
      primaryActivity:
        'COMMERCIO DI PRODOTTI ALIMENTARI E BEVANDE AL DETTAGLIO',
    });
  });
});
