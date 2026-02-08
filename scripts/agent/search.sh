#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  ./scripts/agent/search.sh "<pattern>" [path...]

Notes:
  - Uses ripgrep (rg) if available; otherwise falls back to grep.
  - Skips common large/generated directories by default.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || "${#}" -lt 1 ]]; then
  usage
  exit 0
fi

PATTERN="$1"
shift

PATHS=("$@")
if [[ "${#PATHS[@]}" -eq 0 ]]; then
  PATHS=(".")
fi

EXCLUDE_DIRS=(
  ".git"
  ".next"
  "node_modules"
  "dist"
  "build"
  "coverage"
  ".tmp_pdf_imgs"
  ".tmp_pdf_ocr"
)

if command -v rg >/dev/null 2>&1; then
  # rg is substantially faster; keep defaults strict to reduce noise.
  RG_ARGS=(
    "--line-number"
    "--hidden"
    "--glob" "!.git/*"
    "--glob" "!.next/*"
    "--glob" "!node_modules/*"
    "--glob" "!dist/*"
    "--glob" "!build/*"
    "--glob" "!coverage/*"
    "--glob" "!.tmp_pdf_imgs/*"
    "--glob" "!.tmp_pdf_ocr/*"
  )
  rg "${RG_ARGS[@]}" -- "${PATTERN}" "${PATHS[@]}"
  exit 0
fi

# Portable grep fallback.
GREP_EXCLUDES=()
for d in "${EXCLUDE_DIRS[@]}"; do
  GREP_EXCLUDES+=("--exclude-dir=${d}")
done

grep -RIn "${GREP_EXCLUDES[@]}" -- "${PATTERN}" "${PATHS[@]}"

