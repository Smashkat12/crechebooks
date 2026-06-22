#!/usr/bin/env bash
# install-hooks.sh — symlink the tracked git hooks in scripts/hooks/ into
# .git/hooks/ so they're active. Re-run safely; symlinks mean edits to the
# tracked hook take effect immediately. (Git hooks live outside version control,
# so each clone runs this once: `scripts/install-hooks.sh` or `just install-hooks`.)
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
mkdir -p "$ROOT/.git/hooks"
for h in "$ROOT"/scripts/hooks/*; do
  [ -f "$h" ] || continue
  name="$(basename "$h")"
  chmod +x "$h"
  ln -sf "../../scripts/hooks/$name" "$ROOT/.git/hooks/$name"
  echo "installed hook: $name"
done
echo "✓ git hooks installed — pre-push will run preflight (skip once with: git push --no-verify)"
