# Agent Notes (Minimal Context)

This repo is a Next.js (App Router) MVP called "Blind Challenge": it analyzes public Naver blog challenge posts to surface OSINT risk signals and visualize `clue -> risk -> attack scenario`.

## Read This First

- Prefer `README.md` for full product/background context; keep this file short.
- Avoid reading huge/generated dirs unless explicitly needed: `node_modules/`, `.next/`, `.git/`, `.tmp_pdf_imgs/`, `.tmp_pdf_ocr/`.

## Workflow Defaults

- Search code with: `./scripts/agent/search.sh "<pattern>" [path...]`
- Run checks with: `./scripts/agent/quickcheck.sh`
- Keep current work state in: `docs/agent/state.md` (update rules are at the top of that file).
- Save long-lived prompts/specs and quick retros in: `docs/agent/prompts/` and `docs/agent/evals/` (keep them short).

## Cadence (Recommended)

- Work in 50/10 loops: ~50 minutes build, ~10 minutes update `docs/agent/state.md` and adjust scope.

## Quality Bar

- No secrets in git (never commit `.env.local`).
- Keep changes small and scoped; prefer edits under `src/`.
- When you change behavior: run `./scripts/agent/quickcheck.sh` and fix failures.
