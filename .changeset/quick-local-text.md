---
'visura-parser': patch
---

Reuse reconstructed phrases and normalized field labels within each parse to
reduce repeated text processing. Preserve source spans, parsing rules, public
results, and typed errors without caching data between calls.

Include the documented JSON schema and example output in the npm package.
