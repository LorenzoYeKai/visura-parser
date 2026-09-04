import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { Ajv2020, type SchemaObject } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import type { VisuraDocument } from '../src/index.js';
import { makeTextPdf } from './helpers/pdf.js';

interface JsonSchemaObject {
  readonly type?: string | readonly string[];
  readonly properties?: Record<string, JsonSchemaObject>;
  readonly additionalProperties?: boolean | JsonSchemaObject;
  readonly items?: JsonSchemaObject;
  readonly format?: string;
  readonly minimum?: number;
}

interface TypeShape {
  readonly kind:
    'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean';
  readonly properties?: Record<string, TypeShape>;
  readonly items?: TypeShape;
}

const LEGACY_ROOT_KEYS = [
  'Filename',
  'VisuraType',
  'BusinessName',
  'Address',
  'PECAddress',
  'REANumber',
  'SocialSecurityNumber',
  'VATNumber',
  'LEICode',
  'LegalForm',
  'FoundationDate',
  'RegistrationDate',
  'PrimePresident',
  'ActivityStatus',
  'ATECOCode',
  'ShareCapitalInEuro',
] as const;

function createValidator(schema: SchemaObject) {
  const ajv = new Ajv2020({ allErrors: true });
  addFormats.default(ajv);
  return ajv.compile<VisuraDocument>(schema);
}

async function readJson<T>(path: string): Promise<T> {
  const contents = await readFile(new URL(path, import.meta.url), 'utf8');
  return JSON.parse(contents) as T;
}

function schemaKind(schema: JsonSchemaObject): TypeShape['kind'] {
  if (schema.type === 'integer') return 'integer';
  if (typeof schema.type === 'string') return schema.type as TypeShape['kind'];
  throw new Error(`Unsupported schema type: ${String(schema.type)}`);
}

function shapeFromSchema(schema: JsonSchemaObject): TypeShape {
  const kind = schemaKind(schema);
  if (kind === 'object') {
    const properties: Record<string, TypeShape> = {};
    for (const [key, value] of Object.entries(schema.properties ?? {})) {
      properties[key] = shapeFromSchema(value);
    }
    return { kind, properties };
  }
  if (kind === 'array') {
    if (schema.items === undefined) {
      throw new Error('Array schemas must define items.');
    }
    return { kind, items: shapeFromSchema(schema.items) };
  }
  return { kind };
}

function createTypeChecker(): {
  readonly checker: ts.TypeChecker;
  readonly sourceFile: ts.SourceFile;
} {
  const configPath = ts.findConfigFile(
    '.',
    (path) => ts.sys.fileExists(path),
    'tsconfig.json',
  );
  if (configPath === undefined) {
    throw new Error('Could not find tsconfig.json');
  }
  const config = ts.readConfigFile(configPath, (path) => ts.sys.readFile(path));
  if (config.error !== undefined) {
    throw new Error(
      ts.flattenDiagnosticMessageText(config.error.messageText, '\n'),
    );
  }
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    '.',
    undefined,
    configPath,
  );
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const sourceFile = program.getSourceFile('src/types.ts');
  if (sourceFile === undefined) {
    throw new Error('Could not load src/types.ts');
  }
  return { checker: program.getTypeChecker(), sourceFile };
}

function visuraDocumentType(
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
) {
  const declaration = sourceFile.statements.find(
    (statement): statement is ts.InterfaceDeclaration =>
      ts.isInterfaceDeclaration(statement) &&
      statement.name.text === 'VisuraDocument',
  );
  const symbol =
    declaration === undefined
      ? undefined
      : checker.getSymbolAtLocation(declaration.name);
  if (symbol === undefined) {
    throw new Error('VisuraDocument is not declared in src/types.ts');
  }
  return checker.getDeclaredTypeOfSymbol(symbol);
}

function isTypeFlag(type: ts.Type, flag: ts.TypeFlags): boolean {
  if (type.flags & flag) return true;
  if (type.isUnion()) {
    return type.types
      .filter((member) => !(member.flags & ts.TypeFlags.Undefined))
      .every((member) => isTypeFlag(member, flag));
  }
  return false;
}

function typeKind(checker: ts.TypeChecker, type: ts.Type): TypeShape['kind'] {
  const nonNullable = checker.getNonNullableType(type);
  if (checker.isArrayType(nonNullable)) return 'array';
  if (isTypeFlag(nonNullable, ts.TypeFlags.String)) return 'string';
  if (isTypeFlag(nonNullable, ts.TypeFlags.Number)) return 'number';
  if (isTypeFlag(nonNullable, ts.TypeFlags.Boolean)) return 'boolean';
  if (nonNullable.getProperties().length > 0) return 'object';
  throw new Error(`Unsupported TypeScript type: ${checker.typeToString(type)}`);
}

function arrayElementType(checker: ts.TypeChecker, type: ts.Type) {
  const element = checker.getIndexTypeOfType(
    checker.getNonNullableType(type),
    ts.IndexKind.Number,
  );
  if (element === undefined) {
    throw new Error(`Expected array type, got ${checker.typeToString(type)}`);
  }
  return element;
}

function assertTypeShape(
  checker: ts.TypeChecker,
  type: ts.Type,
  expected: TypeShape,
  path: string,
): void {
  const actualKind = typeKind(checker, type);
  expect(actualKind, path).toBe(
    expected.kind === 'integer' ? 'number' : expected.kind,
  );
  if (expected.kind === 'array') {
    expect(expected.items, `${path} items`).toBeDefined();
    assertTypeShape(
      checker,
      arrayElementType(checker, type),
      expected.items!,
      `${path}[]`,
    );
    return;
  }
  if (expected.kind !== 'object') return;

  const properties = new Map(
    checker
      .getNonNullableType(type)
      .getProperties()
      .map((property) => [property.name, property]),
  );
  expect([...properties.keys()].sort(), path).toEqual(
    Object.keys(expected.properties ?? {}).sort(),
  );

  for (const [key, childShape] of Object.entries(expected.properties ?? {})) {
    const property = properties.get(key);
    expect(property, `${path}.${key}`).toBeDefined();
    expect(
      property!.flags & ts.SymbolFlags.Optional,
      `${path}.${key}`,
    ).not.toBe(0);
    const declaration =
      property!.valueDeclaration ?? property!.declarations?.[0];
    if (declaration === undefined) {
      throw new Error(`Missing declaration for ${path}.${key}`);
    }
    assertTypeShape(
      checker,
      checker.getTypeOfSymbolAtLocation(property!, declaration),
      childShape,
      `${path}.${key}`,
    );
  }
}

function syntheticVisuraPdf(): Uint8Array {
  return makeTextPdf([
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
    { text: 'Forma giuridica', x: 312, y: 420 },
    { text: 'societa a responsabilita limitata', x: 437, y: 420 },
    { text: 'Data iscrizione', x: 312, y: 400 },
    { text: '05/12/2017', x: 437, y: 400 },
    { text: 'Stato attivita', x: 25, y: 520 },
    { text: 'attiva', x: 149, y: 520 },
    { text: 'Codice ATECO', x: 25, y: 480 },
    { text: '62.01', x: 149, y: 480 },
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
  ]);
}

describe('output schema contract', () => {
  it('is a standalone draft 2020-12 JSON Schema', async () => {
    const schema = await readJson<JsonSchemaObject>('../outputSchema.json');

    expect(schema).toMatchObject({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: false,
    });
    expect(schema).not.toHaveProperty('schema');
    expect(schema).not.toHaveProperty('strict');
  });

  it('keeps all public TypeScript keys synchronized with outputSchema.json', async () => {
    const schema = await readJson<JsonSchemaObject>('../outputSchema.json');
    const { checker, sourceFile } = createTypeChecker();

    assertTypeShape(
      checker,
      visuraDocumentType(checker, sourceFile),
      shapeFromSchema(schema),
      'VisuraDocument',
    );
  });

  it('validates exampleOutput.json', async () => {
    const schema = await readJson<SchemaObject>('../outputSchema.json');
    const example = await readJson<VisuraDocument>('../exampleOutput.json');
    const validate = createValidator(schema);

    expect(validate(example), JSON.stringify(validate.errors, null, 2)).toBe(
      true,
    );
  });

  it('validates the parser output from a synthetic PDF', async () => {
    const schema = await readJson<SchemaObject>('../outputSchema.json');
    const validate = createValidator(schema);
    const filename = basename('synthetic.pdf');
    const { parseVisura } = await import('../src/index.js');
    const output = await parseVisura(syntheticVisuraPdf(), { filename });

    expect(output).toMatchObject({
      filename,
      reportType: expect.any(String) as string,
      companyName: 'ACME INDUSTRIA S.R.L.',
      reaNumber: 'RM - 1234567',
      taxCode: '12345678901',
      legalForm: 'societa a responsabilita limitata',
    } satisfies Partial<VisuraDocument>);
    expect(validate(output), JSON.stringify(validate.errors, null, 2)).toBe(
      true,
    );
  });

  it('rejects legacy root keys from outputSchemaOld.json', async () => {
    const schema = await readJson<SchemaObject>('../outputSchema.json');
    const validate = createValidator(schema);

    for (const key of LEGACY_ROOT_KEYS) {
      expect(validate({ [key]: 'not allowed' }), key).toBe(false);
    }
  });

  it('rejects invalid nested data, formats, bounds, and booleans', async () => {
    const schema = await readJson<SchemaObject>('../outputSchema.json');
    const validate = createValidator(schema);

    expect(validate({ primaryRepresentative: { extra: 'not allowed' } })).toBe(
      false,
    );
    expect(
      validate({ activity: { atecoClassifications: [{ extra: 'x' }] } }),
    ).toBe(false);
    expect(validate({ shareholders: [{ extra: 'not allowed' }] })).toBe(false);
    expect(validate({ registrationDate: '2024-02-29' })).toBe(true);
    expect(validate({ registrationDate: '29/02/2024' })).toBe(false);
    expect(validate({ shareCapital: { paidUp: -1 } })).toBe(false);
    expect(validate({ employees: { count: 1.5 } })).toBe(false);
    expect(validate({ employees: { count: -1 } })).toBe(false);
    expect(validate({ companySummary: { hasEquityInterests: 'true' } })).toBe(
      false,
    );
  });
});
