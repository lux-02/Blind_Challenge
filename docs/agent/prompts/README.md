# Prompts (Short, Versioned)

Store only the "long-lived" prompt artifacts that are worth versioning:

- Prompt templates used in API routes (system/developer style).
- Important constraints that repeatedly affect outputs.
- A short changelog for prompt edits that materially change behavior.

Keep these files short. Do not paste long model outputs; link to code and summarize.

Suggested structure:

- `docs/agent/prompts/analyze.md`
- `docs/agent/prompts/graph.md`
- `docs/agent/prompts/vision.md`
- `docs/agent/prompts/phishing.md`

