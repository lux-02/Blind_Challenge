#!/usr/bin/env bash
set -euo pipefail

SKIP_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=1 ;;
    -h|--help)
      cat <<'EOF'
Usage:
  ./scripts/agent/quickcheck.sh [--skip-build]

Runs a fast "did I break anything?" loop for this repo:
  1) npm run lint
  2) TypeScript typecheck (tsc --noEmit)
  3) npm run build (unless --skip-build)
EOF
      exit 0
      ;;
    *)
      echo "Unknown arg: $arg" >&2
      exit 2
      ;;
  esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if [[ ! -f package.json ]]; then
  echo "quickcheck: package.json not found; nothing to run." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "quickcheck: npm not found in PATH." >&2
  exit 1
fi

echo "quickcheck: lint"
npm run -s lint

if [[ -f tsconfig.json ]]; then
  # Prefer local TypeScript via npx.
  echo "quickcheck: typecheck"
  npx -y tsc -p tsconfig.json --noEmit
fi

if [[ "$SKIP_BUILD" -eq 0 ]]; then
  echo "quickcheck: build"
  npm run -s build
fi

echo "quickcheck: ok"

