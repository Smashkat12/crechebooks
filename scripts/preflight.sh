#!/usr/bin/env bash
# preflight.sh — run the checks CI runs ("Lint & Type Check"), locally and
# NON-DESTRUCTIVELY, so a push can't surprise you in CI. Mirrors ci.yml: build
# @crechebooks/types, lint (eslint --fix-dry-run so it predicts the `--fix` CI
# result without writing files), then typecheck. `just validate` runs the real
# (destructive) lint + tests; this is the fast, safe pre-push gate.
#
# Usage: scripts/preflight.sh [--lint] [--typecheck] [--test]   (default: lint + typecheck)
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 2

DO_LINT=0 DO_TYPE=0 DO_TEST=0
if [ $# -eq 0 ]; then DO_LINT=1; DO_TYPE=1; fi
for a in "$@"; do case "$a" in
  --lint) DO_LINT=1;; --typecheck) DO_TYPE=1;; --test) DO_TEST=1;;
  --all) DO_LINT=1; DO_TYPE=1; DO_TEST=1;;
  *) echo "unknown arg: $a"; exit 2;;
esac; done

fail=0
step() { printf '\033[1m▶ %s\033[0m\n' "$1"; }
ok()   { printf '  \033[32m✓ %s\033[0m\n' "$1"; }
bad()  { printf '  \033[31m✖ %s\033[0m\n' "$1"; fail=1; }

step "build @crechebooks/types (CI does this first)"
pnpm --filter @crechebooks/types build >/dev/null 2>&1 && ok "types built" || bad "types build failed"

if [ "$DO_LINT" -eq 1 ]; then
  step "lint apps/api (eslint --fix-dry-run — predicts CI's --fix result, no file writes)"
  if (cd apps/api && npx eslint "{src,test,tests}/**/*.ts" --fix-dry-run --quiet); then
    ok "api lint clean"
  else
    bad "api lint has errors that will FAIL CI (run 'cd apps/api && pnpm lint' to auto-fix)"
  fi
  step "lint apps/web (next lint)"
  (cd apps/web && npx next lint >/dev/null 2>&1) && ok "web lint clean" || bad "web lint errors"
fi

if [ "$DO_TYPE" -eq 1 ]; then
  step "typecheck apps/api (tsc --noEmit)"
  pnpm exec tsc --noEmit --project apps/api/tsconfig.json >/dev/null 2>&1 && ok "api typecheck clean" || bad "api typecheck errors"
  step "typecheck apps/web (tsc --noEmit)"
  (cd apps/web && npx tsc --noEmit >/dev/null 2>&1) && ok "web typecheck clean" || bad "web typecheck errors"
fi

if [ "$DO_TEST" -eq 1 ]; then
  step "tests (pnpm -r test)"
  pnpm -r test >/dev/null 2>&1 && ok "tests pass" || bad "tests failed"
fi

echo ""
if [ "$fail" -eq 0 ]; then
  printf '\033[1;32m✅ preflight PASS — CI lint+typecheck will be green.\033[0m\n'
else
  printf '\033[1;31m❌ preflight FAIL — fix the above before pushing (or push --no-verify to skip).\033[0m\n'
fi
exit $fail
