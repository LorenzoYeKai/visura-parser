# Visura parser architecture

This document records the research-backed architecture for parsing Italian
_visure camerali_. The public contract is now the documented schema in
`outputSchema.json`. The pipeline sections also describe the direction for
deeper evidence and section handling beyond the initial implementation.

The design is based on three inputs:

- the local corpus at `/Users/lorenzo/Documents/CP/visure-examples`;
- the official description of Visure, blocchi informativi and Fascicoli from
  Registro Imprese and the Chambers of Commerce;
- the constraints of this package: ESM, Node.js 20+, deterministic parsing,
  no network, no OCR fallback and no language model in the production path.

## What a Visura is

A Visura is a point-in-time informational view of data published in the
Registro delle Imprese and, where applicable, the REA. It is not the same
document as a _certificato camerale_: the Registro Imprese describes a Visura
as official information that does not have certification value and is not
opposable to third parties. It also has no fixed legal expiry; freshness is a
property of its extraction date.

The parser must therefore model both the business data and the document
snapshot that reported it:

```text
PDF bytes
  -> document snapshot (extraction date, document id, office)
  -> current facts and/or historical events
  -> source-backed public result
```

Do not turn a Visura into an assertion that the data is still current, legally
certified, or complete outside the blocks present in that document.

### Document families to recognize

The official catalogue distinguishes at least these related families:

- ordinary Visura: current legal, economic and administrative information;
- historical Visura: the ordinary information plus deposited changes over a
  requested period;
- targeted information blocks, such as headquarters and local units,
  administrators, capital, shareholders, activities, proceedings, pending
  filings and participations;
- Fascicolo: a composition of Visura blocks plus material such as the latest
  deposited balance sheet and deposited statute or social agreements;
- person/company lookup documents and English reports, which should be
  recognized as different document kinds rather than silently mapped to an
  ordinary company result.

The first implementation should support ordinary and historical Visure and
retain a recognized Fascicolo/block envelope. A block must not be treated as a
partial ordinary Visura without an explicit `kind` and presence information.

### Information domains

The domains recur across document families, but their presence and shape
depend on the legal form and requested blocks:

- identity and registration: name, legal form, tax code, VAT number, REA,
  registration office and dates;
- addresses and contacts: registered office, secondary offices, local units,
  PEC/digital domicile and other published contacts;
- constitutional information: incorporation, duration, object, social
  agreements, statute, capital and instruments;
- activity: status, start date, main and secondary activities, ATECO/NACE,
  import/export, registers, licences and employees;
- governance: administrative body, administrators, representatives, powers,
  control bodies and other offices or qualifications;
- ownership: partners/shareholders, rights on shares or quotas, transfers and
  participations in other companies;
- lifecycle: changes, filings, transfers of business, mergers, demergers,
  succession, dissolution, insolvency proceedings and cancellation;
- referenced material: deposited statutes, balance sheets, acts and pending
  practices.

The object/social-object and powers fields are legal prose. Preserve their
exact normalized text and evidence first. Do not pretend that a free-form
legal paragraph has been safely reduced to a finite list of permissions.

## Public interface

The external interface is one asynchronous operation and typed errors.
Callers do not need to know about pages, PDF.js workers, or heading lexicons.

```ts
parseVisura(input: Uint8Array, options?: ParseVisuraOptions): Promise<VisuraDocument>
```

`VisuraDocument` mirrors the optional properties and nested structures in
`outputSchema.json`, a standalone JSON Schema draft 2020-12 document. The schema forbids extra
properties, so evidence, diagnostics, and internal document kinds must not be
added to the public object.

The implemented invariants are:

- input is bytes, not a filesystem path, URL or stream with hidden timing;
- identical bytes, options, and package version produce identical output;
- no network, clock, locale, randomness or process-global mutable state is
  consulted;
- missing values are omitted; dashes remain only in string-valued fields;
- dates use strict ISO calendar strings; counts and amounts are numbers,
  with explicit parsing of Italian punctuation and precision checks;
- ordinary, historical, and evasion documents have `reportType`; a recognized
  shareholder block omits that field rather than inventing a full-report type;
- invalid, textless, password-required, or unrelated documents fail with a
  `VisuraParseError` whose message contains no document values.

The reference corpus verifier additionally requires a business name, REA,
tax identifier, and legal form for every success. It validates the schema with
formats enabled and compares repeated parses. Schema validity alone is not a
success criterion because `{}` would validate.

### Internal fact model direction

The richer internal model can evolve toward this shape without changing the
public payload. This is a roadmap, not a second exported API:

```text
VisuraResult
  snapshot
    kind: ordinary | historical | fascicolo | block | person | unknown
    language
    office
    extractedAt
    documentId / qrMetadata (optional)
  subject
    entityKind: individual | partnership | capital-company | cooperative | other
    identity
    addresses
    contacts
  domains
    constitutional
    capital
    activities
    peopleAndRoles
    ownership
    locations
    proceedings
    filings
    history
    referencedDocuments
  unknownSections[]
  diagnostics[]
  evidenceIndex
```

Use domain-specific optional values, not a single bag of strings. A missing
field, an explicitly printed dash, an omitted block and an unreadable value
are materially different states and should not all become `null`.

For money, use an exact decimal representation such as a decimal string plus
currency, or integer minor units where the source semantics guarantee cents.
The public schema requires JSON numbers. Parse integer cents first and reject
amounts whose serialized number would change the original cent value. Preserve the
raw printed amount as evidence.

For dates, expose ISO calendar dates only after strict parsing of Italian
`dd/mm/yyyy` forms. Preserve the raw value and reject impossible dates rather
than allowing the host locale to interpret them.

For ATECO, store the code, printed description, code system and explicit
version when present. ATECO 2025 entered into force on 1 January 2025 and was
implemented administratively from 1 April 2025; the transition can expose old
and new codes together. Do not infer the version from the number of digits or
from the current date.

## Pipeline and internal modules

The dependency direction remains strictly one-way:

```text
bytes
  -> input validation
  -> positioned PDF text adapter
  -> layout model
  -> document/section recognition
  -> domain parsers
  -> cross-domain validation
  -> public mapping
```

Each arrow is a seam. Earlier modules must not import later domain knowledge.

### 1. Input validation

`validate-input` is a small boundary module. It should:

1. check the PDF signature and basic byte limits;
2. load the document through the extractor adapter;
3. inspect page count, page dimensions, encryption/password state and parser
   warnings;
4. determine whether usable text spans exist;
5. return a typed `InputAssessment` or a typed parse error.

The errors should distinguish at least:

- `invalid-pdf`: not a parseable PDF;
- `password-required`: the document cannot be opened with an empty password;
- `unsupported-pdf`: a valid construct the selected adapter cannot safely
  process;
- `text-unavailable`: image-only or otherwise textless input;
- `malformed-content`: the PDF loads but a page cannot be interpreted.

Do not classify a document as image-only solely because one extraction call is
empty. Check every page and retain the page number that failed.

### 2. Positioned text adapter

Define an internal adapter with a deliberately small interface:

```ts
interface PositionedTextExtractor {
  extract(bytes: Uint8Array): Promise<ExtractedPdf>;
}
```

The first adapter should use the official PDF.js Node example shape and
`getTextContent()`, not viewer internals. Each text item should retain:

- page number and page width/height;
- raw string;
- transform/bounding box, width and height;
- text direction and font metadata where available;
- line-break hint (`hasEOL`);
- marked-content id when requested;
- adapter warnings and document metadata.

PDF.js documents that `TextItem` exposes `str`, `transform`, `width`, `height`,
`fontName` and `hasEOL`. The official issue tracker also makes clear that the
returned item order is not a reliable page reading order. Therefore the
adapter returns spans; layout reconstruction owns reading order.

Pin the PDF.js version. The current PDF.js support documentation lists Node.js
22+ for the modern support matrix, while this package promises Node.js 20+.
Select and test a PDF.js release/build that actually supports Node 20, use the
legacy Node entry point if required by that release, and add a CI matrix test.
Do not float to the latest release without this compatibility check.

The adapter is the real seam: a second adapter can later target another PDF
engine or a controlled text fixture without changing any field parser. Do not
add a second implementation until a real incompatibility justifies it.

### 3. Layout normalization

`normalize-layout` converts spans into a lossless, engine-neutral page model:

```text
Page
  geometry
  spans[]
  lines[]
  regions[]
  chrome: header/footer candidates
```

Keep both spans and derived lines. The derived model is replaceable; evidence
must never depend on throwing away the source geometry.

Techniques:

- Unicode NFC normalization and explicit handling of non-breaking spaces,
  soft hyphens, line-ending differences and common extraction artefacts;
- preserve a `rawText` value beside every normalized value;
- cluster spans into lines using baseline/top tolerances relative to span
  height, not a single absolute pixel tolerance;
- sort within a line by x position and infer columns from repeated x anchors;
- identify table rows/cells from geometric overlap and repeated label/value
  columns, not from spaces in a concatenated string;
- use page dimensions and normalized coordinates so near-A4 templates remain
  comparable;
- detect repeated page chrome by normalized text plus stable geometry, while
  retaining the chrome as evidence and avoiding it as a field source;
- treat paragraph wrapping and hyphenation as a layout concern; never remove a
  hyphen from a legal name or legal prose merely because it appears at a line
  ending.

The renderer's item order is only a hint. A two-column cover must be rebuilt
from coordinates before label/value parsing; otherwise an administrator name,
PEC or summary count can be associated with the wrong label.

### 4. Document and section recognition

`recognize-document` is a deterministic finite-state recognizer over normalized
pages and lines.

Recognition order:

1. locate the document title and document-family markers;
2. recognize the Chamber/office as metadata, never as the template identity;
3. identify the subject/entity from stable labels such as legal form and
   registration fields;
4. use the cover index and heading lexicon to seed sections;
5. continue sections across page breaks until the next heading or document
   footer boundary;
6. retain unrecognized regions as `unknownSections` with evidence.

Headings need an explicit Italian lexicon with accent/apostrophe/whitespace
variants: `ATTIVITA'`, `ATTIVITÀ`, `UNITA' LOCALI`, `SOCI E TITOLARI DI
DIRITTI...`, and similar forms must converge to one semantic heading while
retaining the printed spelling.

Recognize by semantic anchors and combinations, not exact coordinates or
Chamber names. A layout profile may be added only when two real layouts have
different behavior; a profile that only renames a heading is unnecessary
shallow indirection.

### 5. Domain parsers

Domain parsers consume plain normalized rows/paragraphs and return typed
values plus evidence. They do not know about PDF.js.

Recommended order:

1. snapshot and subject identity;
2. addresses, PEC and registration identifiers;
3. activity and ATECO/NACE;
4. dates and exact numbers;
5. capital and summary counts;
6. locations;
7. people, roles and powers;
8. ownership and participations;
9. proceedings and filings;
10. historical events and referenced documents.

Field grammars should be label-first and strict:

- Italian amounts: thousands `.` and decimal `,`, with explicit handling of
  `-`, `n.d.` and blank values;
- tax identifiers: preserve the printed string, validate known checksums only
  when the field is unambiguously identified;
- REA: parse the province code and numeric component separately;
- addresses: parse components when labels make them unambiguous, but retain a
  canonical raw address line for anything not safely decomposable;
- counts: do not convert a dash to zero;
- people: model one person with multiple roles/periods, not one flattened name
  per section;
- powers, object and other legal narrative: normalized text + raw evidence,
  with structured subfields added only for a demonstrated use case.

Historical information is an event ledger, not a guessed replay of the
company's state. An event should retain its date, protocol/act identifiers,
event label and detail text. Reconstructing state from events can be a later,
separate module with its own documented rules.

### 6. Cross-domain validation

`validate-result` runs pure checks after all domain parsers finish. It should
produce warnings for document incompleteness and errors for contradictions
that make the result unsafe.

Examples:

- identity fields repeated in different sections must agree, or emit a
  conflict with both evidence locations;
- date ordering must be valid where semantics require it;
- summary counts must not contradict parsed current people/locations;
- monetary values must parse consistently and ownership totals should be
  checked only when the document supplies the necessary denominator;
- a block document must not claim that omitted domains were empty;
- historical events should not be silently treated as current facts;
- duplicate sections should be merged only when their evidence and semantic
  identity agree.

Avoid a single numeric "confidence" that hides failures. Use deterministic
diagnostic codes, matched rule names and evidence spans. If two recognition
candidates tie, return an ambiguity diagnostic instead of guessing.

### 7. Public mapping

`map-result` is the only module that knows the published schema. It converts
the internal document graph, evidence and diagnostics into public values and
types. Unknown sections remain visible. This is the compatibility seam for
future schema versions and should be the only place that introduces public
defaults.

## Evidence and diagnostics

Evidence is a first-class value, not a debug string:

```text
Evidence
  page: number
  boxes: { x, y, width, height }[]
  rawText: string
  normalizedText: string
  section?: semantic heading
  rule?: deterministic parser rule
```

Every parsed field should carry an internal evidence reference. The public
schema may expose compact evidence by default and offer a detailed mode later,
but the internal graph must retain enough information to diagnose page,
section, row and span errors.

Diagnostics should be structured:

```text
Diagnostic
  severity: info | warning | error
  code
  message
  page?
  section?
  evidence[]
```

Messages must not include private values by default. Tests and logs should
refer to page/section/rule identifiers, and any corpus manifest should use
cryptographic file hashes and structural metadata rather than document text.

## Deterministic techniques

The production parser is a grammar and layout engine, not an OCR system.

- No network calls, remote parsing, language model, current clock, host
  locale, random value or shared mutable cache.
- No OCR fallback in the first contract. An image-only PDF returns
  `text-unavailable`; an OCR adapter can be a future opt-in product with a
  different determinism and evidence contract.
- No regular expression applied to the whole PDF text. Regexes operate on
  normalized, section-scoped rows or paragraphs.
- No exact x/y coordinates as semantic truth. Use normalized geometry and
  repeated anchors.
- No silent data repair. Normalization must preserve raw text, and validation
  must disclose conflicts.
- Sort only collections whose source order has no meaning. Preserve source
  order for historical events, roles and document sections when it conveys
  meaning.

## Testing strategy

### Corpus triage

Create a local-only corpus manifest outside committed fixtures containing:

- SHA-256 of each file;
- PDF validity, encryption/password result, producer, page count and geometry;
- extractor success, per-page text availability and warning codes;
- document-family and entity-kind recognition;
- section presence bitmap;
- no names, addresses, tax identifiers, emails or raw text.

The manifest is for coverage planning, not a golden output.

### Test layers

- Input tests: malformed suffixes, invalid bytes, password-required PDFs,
  encrypted readable PDFs, empty pages and image-only documents.
- Layout unit tests: line clustering, columns, tables, page chrome, wrapped
  labels, accent/apostrophe variants and page breaks.
- Grammar unit tests: dates, amounts, VAT/tax identifiers, REA, ATECO,
  counts, explicit dashes and address components.
- Section tests: ordinary, historical, Fascicolo and targeted blocks with
  unknown sections preserved.
- Integration tests: complete synthetic/anonymized PDFs through the public
  entry point, including at least one capital company and one individual
  business, plus a historical document.
- Property tests: locale-sensitive numbers/dates and identifier checksums;
  round-trip normalization must never change the raw evidence.
- Compatibility tests: the selected PDF adapter on each supported Node
  version and on representative producer/layout families.
- Fuzz tests: truncated PDFs, malformed text streams and adversarially large
  pages must fail with bounded, typed diagnostics.

Every parser fix needs a failing fixture or test that demonstrates the old
behavior. Do not update a golden output without explaining the source change.

### Privacy rules

Real documents stay under `test/fixtures/private/` or outside the repository.
Committed fixtures must be synthetic or fully anonymized while preserving
layout, character classes, wrapping, counts and grammar. Never put raw
document text in snapshots, exceptions, review comments or commit messages.

## Implementation sequence

1. Build the corpus manifest and select a small, reviewed fixture matrix.
2. Add the PDF adapter and input error model; prove it against encrypted,
   unencrypted, malformed and textless samples.
3. Add the lossless span/page model and layout normalization.
4. Recognize cover/document family and preserve unknown sections.
5. Parse identity, snapshot metadata, addresses, PEC and activity.
6. Add exact locale-aware dates, numbers, identifiers and ATECO versioning.
7. Add entity-specific capital, governance, ownership and locations.
8. Add historical events, blocks and Fascicolo referenced documents.
9. Freeze the first public schema from representative anonymized fixtures,
   add a changeset, examples and public-entry-point tests.

At every step, run the narrowest test first and `bun run check` before handoff.
Do not publish or generate `dist/` as part of architecture work.

## Open decisions to resolve with fixtures

- Whether the first published API should expose Fascicolo content as a single
  result or as a typed composition of Visura blocks.
- Which historical event categories are stable enough to model beyond raw
  event text and dates.
- Whether public evidence is on by default or available through a detailed
  parse option.
- Which PDF.js release is the oldest safe choice that still supports Node 20;
  this must be established by an executable compatibility test, not package
  metadata alone.
- Which legal-form-specific domains are required for the first release; the
  document format allows domains to be absent without implying that the
  underlying enterprise lacks them.
