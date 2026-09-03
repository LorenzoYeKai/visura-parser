# Architecture direction

This document records constraints for the parser without freezing interfaces
before representative documents exist.

## Determinism

For a fixed library version and identical PDF bytes, parsing must return the
same value or the same typed error. Parsing must not depend on network calls,
language models, clocks, locale defaults, process-global mutable state, or
randomness.

## Proposed stages

1. Validate that the input is a supported, text-based PDF.
2. Extract positioned text while preserving page and line evidence.
3. Normalize typography and layout without changing source meaning.
4. Recognize document variants and sections.
5. Parse fields into an internal representation.
6. Validate cross-field invariants.
7. Map the internal representation to a versioned public result.

Each stage should accept and return plain data. Errors should retain enough
location information to explain which page, section, or text span failed.

## Compatibility

The first public schema should follow real, anonymized examples rather than one
provider's response shape. Once published, schema changes will follow semantic
versioning. Unknown sections should remain observable so a new Chamber layout
cannot silently disappear from the result.

## Testing strategy

Tests will use synthetic or anonymized PDFs with checked-in expected outputs.
Unit tests should cover normalization and individual field grammars. Integration
tests should parse complete PDFs and compare the full structured result.
Property tests are a good fit for locale-sensitive values such as Italian
dates, currency amounts, tax identifiers, and REA numbers.
