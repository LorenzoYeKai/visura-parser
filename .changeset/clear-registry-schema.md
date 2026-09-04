---
'visura-parser': major
---

Migrate parser results to the documented camelCase output schema. Replace flat
strings and translated role arrays with typed activity, capital, employee,
summary, document, officer, and shareholder records. Consumers must update
property accesses; the previous output contract is no longer returned.

Parse Italian counts and monetary values into numbers, explicit availability
into booleans, and reference dates into ISO dates. Preserve Italian role names,
separate sole proprietors from shareholders, keep representatives tied to the
cover, and read structured ATECO/ATECORI classifications and ownership details.
