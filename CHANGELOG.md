# visura-parser

## 1.2.0

### Minor Changes

- 8d93180: Extract optional birth date, birthplace, birth-province code, citizenship, and residence address for individual officers and shareholders. Repeated summary and detail rows now resolve to one person when a unique normalized name identifies the detailed tax-code record.

## 1.1.0

### Minor Changes

- 9cd67c6: Add current local units to parsed Visura output, including their registry number, address, opening date, REA number, and primary activity description when available. Recognize compound partner-governance roles as both officers and shareholders, and recognize gendered administrator titles when selecting officers and primary representatives.

## 1.0.1

### Patch Changes

- 493164f: Reuse reconstructed phrases and normalized field labels within each parse to
  reduce repeated text processing. Preserve source spans, parsing rules, public
  results, and typed errors without caching data between calls.

  Include the documented JSON schema and example output in the npm package.

## 1.0.0

### Major Changes

- ea129af: Migrate parser results to the documented camelCase output schema. Replace flat
  strings and translated role arrays with typed activity, capital, employee,
  summary, document, officer, and shareholder records. Consumers must update
  property accesses; the previous output contract is no longer returned.

  Parse Italian counts and monetary values into numbers, explicit availability
  into booleans, and reference dates into ISO dates. Preserve Italian role names,
  separate sole proprietors from shareholders, keep representatives tied to the
  cover, and read structured ATECO/ATECORI classifications and ownership details.

### Minor Changes

- ea129af: Add a deterministic text-based PDF parser with the INDA Visura output schema,
  typed input errors, ISO date handling, positioned field extraction, and a
  privacy-safe reference corpus verifier.

### Patch Changes

- ea129af: Read ShareCapitalInEuro only from the dedicated euro capital table. Correctly
  associate Deliberato, Sottoscritto, and Versato with amounts across the page
  midpoint, and prevent shareholder quota payments from filling capital fields.
- ea129af: Recognize proprietor and feminine partner roles in evasion reports, keep legal
  forms separate from representative names, and read activity descriptions and
  start dates from the report body. Restrict people extraction to the relevant
  sections and preserve names, quotas, and roles across page breaks without
  turning statutory prose, wrapped role labels, or qualifications into people.
  Keep quota amounts above the next ownership heading from overwriting the
  previous shareholder's nominal value.
- ea129af: Correct evasion report extraction for wrapped company names, legal forms,
  inline company dates, and activity status. Keep shareholder rights, nominal
  amounts, tax codes, and sole-shareholder roles attached to the correct person.
  Exclude role annotations and protocol filing details from current records.
