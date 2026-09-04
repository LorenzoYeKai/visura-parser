---
'visura-parser': patch
---

Read ShareCapitalInEuro only from the dedicated euro capital table. Correctly
associate Deliberato, Sottoscritto, and Versato with amounts across the page
midpoint, and prevent shareholder quota payments from filling capital fields.
