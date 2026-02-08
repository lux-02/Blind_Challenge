# Smoke Cases

Fill these in with stable, public test inputs you are comfortable running repeatedly.
Do not store secrets here.

## Case 1: Happy Path (Blog ID)

- Input: (naver id or blog url)
- Expected:
  - `/analysis` completes without crashing
  - `/report` renders
  - Top 위험 게시물 list is non-empty OR an explicit "no findings" state is shown

## Case 2: Edge (No Challenge Category)

- Input:
- Expected:
  - Category auto-detect shows a clear failure/empty state (no infinite loading)

## Case 3: Policy Guardrail (PII)

- Input:
- Expected:
  - UI/API outputs do not include raw phone numbers / emails / addresses
  - If found, they are masked/shortened

