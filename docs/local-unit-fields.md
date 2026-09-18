# Local-unit field coverage

The private corpus reviewed on 18 September 2026 contains 346 PDFs. Of these,
341 parse successfully and five receive expected typed rejections. Current
local-unit detail blocks occur in 70 documents and contain 92 records.
This inventory records aggregate counts and public labels only.

The parser now extracts these optional fields when their detail blocks are
present:

| Field                      | Documents | Local units | Source information                                        |
| -------------------------- | --------: | ----------: | --------------------------------------------------------- |
| `type`                     |        70 |          92 | Facility descriptor beside the unit heading               |
| `atecoCode`                |        58 |          79 | First primary or prevailing code in printed order         |
| `atecoClassifications`     |        58 |          79 | Codes, descriptions, importance, explicit versions        |
| `secondaryActivity`        |        13 |          21 | Attività secondaria esercitata                            |
| `tradeName`                |        13 |          14 | Insegna                                                   |
| `activityDeclarations`     |        28 |          33 | Denuncia attività, including SCIA and receiving authority |
| `licensesAndRegistrations` |         8 |           9 | Licenze/autorizzazioni                                    |

The 211 local ATECO classifications include 120 entries under ATECO 2025 and
91 under ATECORI 2007-2022. Both versions stay in source order, including
repeated codes. Versions are read from explicit headings. If no primary or
prevailing qualifier exists, `atecoCode` uses the first unqualified entry;
secondary-only classifications do not produce a primary code.

Declarations and licences retain their normalized printed prose, including
dates, identifiers and receiving authorities. Repeated labelled blocks become
separate array entries. Missing fields remain absent.

## Layout constraints

Summary rows and detail records use different left margins. Only detail
headings create records. The right-hand facility descriptor has a baseline
about three points above the left-hand unit heading in this corpus. It belongs
to that unit and must be excluded from the preceding record.

The first ATECO code can share a row with its left-hand classification heading.
Wrapped heading text must not become part of the code's description. Page
continuations retain the active record; subsequent units and numbered sections
end it. The document parser excludes historical sections before parsing units.

Technical-manager subsections also occur. Their tax identifiers belong to
people, so they are not mapped to unit or company tax identifiers. They remain
a candidate for a separate local-unit person model. Employee and NACE labels
found elsewhere in a document are not sufficient evidence for a unit-level
value.

Synthetic tests reproduce these layouts without copying private values.
The corpus verifier checks the public schema, meaningful company identity,
typed rejections and repeated-parse determinism.
Comparing the complete corpus outputs shows no company-level changes or
local-unit count changes. Four primary-activity values now correctly stop
before an accented `denuncia attività` heading; that filing prose is extracted
separately instead of being appended to the activity.
