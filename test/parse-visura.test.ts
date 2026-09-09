import { describe, expect, it } from 'vitest';

import { parseVisura, type VisuraParseError } from '../src/index.js';
import { makeTextPdf } from './helpers/pdf.js';

describe('parseVisura', () => {
  it('extracts a schema-compatible result from positioned PDF text', async () => {
    const input = makeTextPdf([
      {
        text: "VISURA ORDINARIA SOCIETA' DI CAPITALE",
        x: 83,
        y: 648,
        size: 11,
      },
      { text: 'ACME INDUSTRIA S.R.L.', x: 83, y: 614, size: 14 },
      { text: 'Sede legale', x: 312, y: 520 },
      { text: 'ROMA (RM) VIA ESEMPIO 1', x: 437, y: 520 },
      { text: 'Domicilio digitale/PEC', x: 312, y: 500 },
      { text: 'acme@example.test', x: 437, y: 500 },
      { text: 'Numero REA', x: 312, y: 480 },
      { text: 'RM - 1234567', x: 437, y: 480 },
      { text: 'Codice fiscale', x: 312, y: 460 },
      { text: '12345678901', x: 437, y: 460 },
      { text: 'Partita IVA', x: 312, y: 440 },
      { text: '12345678901', x: 437, y: 440 },
      { text: 'Data iscrizione', x: 312, y: 420 },
      { text: '05/12/2017', x: 437, y: 420 },
      { text: 'Stato attivita', x: 25, y: 520 },
      { text: 'attiva', x: 149, y: 520 },
      { text: 'Codice ATECO', x: 25, y: 480 },
      { text: '62.01', x: 149, y: 480 },
      { text: 'Versato: 100,00', x: 252, y: 370 },
      { text: 'Capitale sociale in Euro', x: 87, y: 340 },
      { text: 'Deliberato:', x: 252, y: 340 },
      { text: '30.000,00', x: 320, y: 340 },
      { text: 'Sottoscritto:', x: 252, y: 325 },
      { text: '20.000,00', x: 320, y: 325 },
      { text: 'Versato:', x: 252, y: 310 },
      { text: '10.000,00', x: 320, y: 310 },
      { text: 'Amministratore', x: 25, y: 240 },
      { text: 'MARIO ROSSI', x: 149, y: 240 },
      { text: "Proprieta'", x: 25, y: 200 },
      { text: 'ALFA HOLDING S.R.L.', x: 25, y: 184 },
      { text: "7 Sedi secondarie ed unita' locali", x: 25, y: 160 },
      { text: "Unita' Locale n. RM/1", x: 37, y: 140 },
      { text: 'Data apertura: 05/12/2017', x: 202, y: 120 },
      { text: 'Indirizzo: ROMA (RM) VIA PROVA 2 - 00100', x: 37, y: 100 },
    ]);

    const originalBytes = input.slice();
    const result = await parseVisura(input, { filename: 'synthetic.pdf' });
    expect(input).toEqual(originalBytes);

    expect(result).toEqual({
      filename: 'synthetic.pdf',
      reportType: "VISURA ORDINARIA SOCIETA' DI CAPITALE",
      companyName: 'ACME INDUSTRIA S.R.L.',
      registeredOfficeAddress: 'ROMA (RM) VIA ESEMPIO 1',
      certifiedEmail: 'acme@example.test',
      reaNumber: 'RM - 1234567',
      taxCode: '12345678901',
      vatNumber: '12345678901',
      registrationDate: '2017-12-05',
      activity: { status: 'attiva', atecoCode: '62.01' },
      primaryRepresentative: { name: 'MARIO ROSSI', role: 'Amministratore' },
      officers: [{ name: 'MARIO ROSSI', roles: ['Amministratore'] }],
      shareholders: [{ name: 'ALFA HOLDING S.R.L.', rightType: "Proprieta'" }],
      shareCapital: {
        currency: 'EUR',
        authorized: 30000,
        subscribed: 20000,
        paidUp: 10000,
      },
      localUnits: [
        {
          number: 'RM/1',
          address: 'ROMA (RM) VIA PROVA 2 - 00100',
          openingDate: '2017-12-05',
        },
      ],
    });
  });

  it('returns a typed error for a non-PDF input', async () => {
    const parsing = parseVisura(new TextEncoder().encode('not a pdf'));

    await expect(parsing).rejects.toMatchObject<Partial<VisuraParseError>>({
      name: 'VisuraParseError',
      code: 'invalid-pdf',
    });
  });

  it('extracts optional officer identity details through the public parser', async () => {
    const result = await parseVisura(
      makeTextPdf([
        {
          text: "VISURA ORDINARIA SOCIETA' DI CAPITALE",
          x: 83,
          y: 648,
          size: 11,
        },
        { text: 'IMPRESA SINTETICA S.R.L.', x: 83, y: 614, size: 14 },
        { text: 'Amministratore Unico', x: 25, y: 400 },
        { text: 'MARIO ROSSI', x: 150, y: 400 },
        { text: 'Nato a ROMA (RM) il 01/01/1980', x: 150, y: 380 },
        { text: 'Codice fiscale: RSSMRA80A01F205X', x: 150, y: 360 },
        { text: 'Cittadinanza: ITALIANA', x: 150, y: 340 },
        { text: 'Residenza: ROMA VIA ESEMPIO 1', x: 150, y: 320 },
      ]),
    );

    expect(result.officers).toEqual([
      {
        name: 'MARIO ROSSI',
        taxCode: 'RSSMRA80A01F205X',
        birthDate: '1980-01-01',
        birthPlace: 'ROMA',
        birthProvince: 'RM',
        citizenship: 'ITALIANA',
        residenceAddress: 'ROMA VIA ESEMPIO 1',
        roles: ['Amministratore Unico'],
      },
    ]);
  });

  it('rejects a PDF without extractable text', async () => {
    const parsing = parseVisura(makeTextPdf([]));

    await expect(parsing).rejects.toMatchObject<Partial<VisuraParseError>>({
      code: 'text-unavailable',
    });
  });

  it('rejects a text-bearing non-Visura instead of returning an empty object', async () => {
    await expect(
      parseVisura(
        makeTextPdf([{ text: 'CERTIFICATO REGISTRO IMPRESE', x: 80, y: 700 }]),
      ),
    ).rejects.toMatchObject({ code: 'unsupported-pdf' });
  });

  it('recognizes the shareholder block without inventing a reportType', async () => {
    const result = await parseVisura(
      makeTextPdf([
        {
          text: 'SOCI E TITOLARI DI DIRITTI SU AZIONI E QUOTE',
          x: 83,
          y: 649,
          size: 13,
        },
        { text: 'IMPRESA SINTETICA S.R.L.', x: 83, y: 615, size: 14 },
        { text: 'DATI ANAGRAFICI', x: 312, y: 618, size: 11 },
        { text: 'Numero REA', x: 312, y: 567 },
        { text: 'RM - 1234567', x: 436, y: 567 },
        { text: 'Visura camerale', x: 14, y: 14 },
      ]),
    );
    expect(result.companyName).toBe('IMPRESA SINTETICA S.R.L.');
    expect(result.reportType).toBeUndefined();
  });
});
