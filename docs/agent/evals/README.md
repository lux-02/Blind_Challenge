# Evals (Lightweight)

Goal: keep 3-10 small, repeatable "smoke" cases that tell you if the product got worse.

For this repo, the fastest signal is:

- API shape still works (no runtime errors)
- Report/graph generation still produces non-empty structured output
- PII masking policy still holds (no raw phone/email/etc in UI)

Add/edit cases in `cases.md`. Keep expected outcomes as high-level assertions (not exact strings).

