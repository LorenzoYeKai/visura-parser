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
        type: 'PUNTO VENDITA',
        address: 'ROMA (RM) VIA ESEMPIO 1 - 00100',
        openingDate: '2017-12-05',
        reaNumber: 'LE - 123456',
        primaryActivity: 'COMMERCIO AL DETTAGLIO',
        secondaryActivity: 'RISTORAZIONE',
        atecoClassifications: [{ code: '47.11.00', version: '2025' }],
        atecoCode: '47.11.00',
      },
      {
        number: 'LE/2',
        address: 'MILANO (MI) VIA PROVA 2 - 20100',
      },
    ]);
  });

  it('keeps local-unit classifications scoped to each record and printed version', () => {
    const pdf: ExtractedPdf = {
      pages: [
        page(1, [
          span(1, "7 Sedi secondarie ed unita' locali", 32, 720),
          span(1, "Unita' Locale n. MI / 1", 37, 690),
          span(1, 'NEGOZIO', 37, 675),
          span(1, 'Data apertura: 15/03/2024', 202, 660),
          span(1, "Attivita' secondaria esercitata", 37, 640),
          span(1, 'RISTORAZIONE', 202, 625),
          span(1, 'Classificazione ATECO 2025', 37, 605),
          span(1, 'Codice: 47.11.00 - COMMERCIO AL DETTAGLIO', 202, 605),
        ]),
        page(2, [
          span(2, "dell'attivita'", 37, 740),
          span(2, 'DI PRODOTTI ALIMENTARI', 202, 740),
          span(2, 'Importanza: primaria', 37, 720),
          span(2, 'Fonte: REGISTRO IMPRESE', 37, 700),
          span(2, 'Classificazione ATECORI 2007-2022', 37, 680),
          span(2, 'Codice: 47.11.00 - COMMERCIO AL DETTAGLIO', 202, 680),
          span(2, "dell'attivita'", 37, 660),
          span(2, 'DI PRODOTTI ALIMENTARI', 202, 660),
          span(2, 'Importanza: secondaria', 37, 600),
          span(2, "Unita' Locale n. MI / 2", 37, 570),
          span(2, 'LABORATORIO', 37, 550),
          span(2, 'Indirizzo: MILANO (MI) VIA SECONDA 2', 37, 530),
          span(2, "Attivita' esercitata: PRODUZIONE", 37, 510),
          span(2, "Unita' Locale n. MI / 3", 37, 470),
          span(2, 'UFFICI', 37, 450),
          span(2, 'Data apertura: 31/02/2024', 202, 430),
          span(2, 'Indirizzo: MILANO (MI) VIA TERZA 3', 37, 410),
          span(2, '9 Storia delle modifiche', 32, 370),
        ]),
      ],
    };

    expect(parseLocalUnits(pdf)).toEqual([
      {
        number: 'MI/1',
        type: 'NEGOZIO',
        openingDate: '2024-03-15',
        secondaryActivity: 'RISTORAZIONE',
        atecoClassifications: [
          {
            code: '47.11.00',
            description: 'COMMERCIO AL DETTAGLIO DI PRODOTTI ALIMENTARI',
            importance: 'primaria',
            version: '2025',
          },
          {
            code: '47.11.00',
            description: 'COMMERCIO AL DETTAGLIO DI PRODOTTI ALIMENTARI',
            importance: 'secondaria',
            version: '2007-2022',
          },
        ],
        atecoCode: '47.11.00',
      },
      {
        number: 'MI/2',
        type: 'LABORATORIO',
        address: 'MILANO (MI) VIA SECONDA 2',
        primaryActivity: 'PRODUZIONE',
      },
      {
        number: 'MI/3',
        type: 'UFFICI',
        address: 'MILANO (MI) VIA TERZA 3',
      },
    ]);
  });

  it('selects the first unqualified classification when no primary marker exists', () => {
    const pdf: ExtractedPdf = {
      pages: [
        page(1, [
          span(1, "Unita' Locale n. TO / 1", 37, 700),
          span(1, 'PUNTO SERVIZI', 37, 680),
          span(1, "Classificazione ATECO 2025 dell'attivita'", 37, 660),
          span(1, 'Codice: 62.01.00', 37, 640),
          span(1, 'Importanza: secondaria', 37, 620),
          span(1, 'Codice: 62.02.00', 37, 600),
          span(1, 'Descrizione: CONSULENZA INFORMATICA', 37, 580),
        ]),
      ],
    };

    expect(parseLocalUnits(pdf)[0]).toMatchObject({
      atecoCode: '62.02.00',
      atecoClassifications: [
        { code: '62.01.00', importance: 'secondaria' },
        { code: '62.02.00', description: 'CONSULENZA INFORMATICA' },
      ],
    });
  });

  it('preserves a versionless classification and does not promote secondary-only activity', () => {
    const pdf: ExtractedPdf = {
      pages: [
        page(1, [
          span(1, "Unita' Locale n. GE / 1", 37, 700),
          span(1, 'PUNTO VENDITA', 37, 680),
          span(1, 'Data apertura: 04/04/2024', 202, 680),
          span(1, 'Indirizzo: GENOVA (GE) VIA QUARTA 4', 37, 660),
          span(1, 'Classificazione ATECO', 37, 640),
          span(1, 'Codice: 56.10.11 - SOMMINISTRAZIONE', 202, 640),
          span(1, "dell'attivita'", 37, 620),
          span(1, 'Importanza: secondaria', 202, 620),
        ]),
      ],
    };

    expect(parseLocalUnits(pdf)).toEqual([
      {
        number: 'GE/1',
        type: 'PUNTO VENDITA',
        openingDate: '2024-04-04',
        address: 'GENOVA (GE) VIA QUARTA 4',
        atecoClassifications: [
          {
            code: '56.10.11',
            description: 'SOMMINISTRAZIONE',
            importance: 'secondaria',
          },
        ],
      },
    ]);
  });

  it('extracts local trade name, activity declarations and licences within one record', () => {
    const pdf: ExtractedPdf = {
      pages: [
        page(1, [
          span(1, "Unita' Locale n. BO / 1", 37, 700),
          span(1, 'NEGOZIO', 202, 703),
          span(1, 'Data apertura: 12/02/2024', 202, 690),
          span(1, 'Insegna', 37, 670),
          span(1, 'BOTTEGA SINTETICA', 202, 670),
          span(1, 'Indirizzo', 37, 650),
          span(1, 'BOLOGNA (BO) VIA QUINTA 5', 202, 650),
          span(1, "Attivita' esercitata", 37, 630),
          span(1, 'VENDITA AL DETTAGLIO', 202, 630),
          span(1, 'Denuncia attività', 37, 610),
          span(
            1,
            'SCIA Presentata presso SUAP COMUNE SINTETICO il 10/02/2024',
            202,
            610,
          ),
          span(1, 'Responsabile tecnico', 37, 590),
          span(1, 'NOME SINTETICO', 202, 590),
          span(1, 'Nato a ROMA (RM) il 01/01/1980', 202, 575),
          span(1, 'Codice fiscale: SNTNMO80A01H501X', 202, 560),
          span(1, 'Licenza/autorizzazione', 37, 540),
          span(1, 'Licenza commerciale numero SINT-42', 202, 540),
          span(1, 'Classificazione ATECO 2025', 37, 520),
          span(1, 'Codice: 47.19.10 - COMMERCIO MISTO', 202, 520),
          span(1, "Unita' Locale n. BO / 3", 37, 490),
          span(1, 'MAGAZZINO', 202, 493),
          span(1, 'Indirizzo', 37, 470),
          span(1, 'BOLOGNA (BO) VIA SETTIMA 7', 202, 470),
        ]),
      ],
    };

    expect(parseLocalUnits(pdf)).toEqual([
      {
        number: 'BO/1',
        type: 'NEGOZIO',
        openingDate: '2024-02-12',
        tradeName: 'BOTTEGA SINTETICA',
        address: 'BOLOGNA (BO) VIA QUINTA 5',
        primaryActivity: 'VENDITA AL DETTAGLIO',
        activityDeclarations: [
          'SCIA Presentata presso SUAP COMUNE SINTETICO il 10/02/2024',
        ],
        licensesAndRegistrations: ['Licenza commerciale numero SINT-42'],
        atecoClassifications: [
          {
            code: '47.19.10',
            description: 'COMMERCIO MISTO',
            version: '2025',
          },
        ],
        atecoCode: '47.19.10',
      },
      {
        number: 'BO/3',
        type: 'MAGAZZINO',
        address: 'BOLOGNA (BO) VIA SETTIMA 7',
      },
    ]);
  });

  it('keeps a trade sign from becoming a facility type when no type is printed', () => {
    const pdf: ExtractedPdf = {
      pages: [
        page(1, [
          span(1, "Unita' Locale n. BO / 2", 37, 700),
          span(1, 'Insegna', 37, 680),
          span(1, 'INSEGNA SOLO', 202, 680),
          span(1, 'Indirizzo', 37, 660),
          span(1, 'BOLOGNA (BO) VIA SESTA 6', 202, 660),
        ]),
      ],
    };

    expect(parseLocalUnits(pdf)).toEqual([
      {
        number: 'BO/2',
        tradeName: 'INSEGNA SOLO',
        address: 'BOLOGNA (BO) VIA SESTA 6',
      },
    ]);
  });
});
