#!/usr/bin/env bash
# deploy-verify.sh — push a branch (optional) and poll a URL until it returns the
# expected status/body, or timeout. Automates the manual "push → wait for the
# Railway deploy → curl the endpoint to confirm it's live" loop.
#
# Usage:
#   scripts/deploy-verify.sh --url <url> [--expect-status N] [--expect-text PAT]
#                            [--timeout SEC] [--interval SEC] [--push BRANCH]
#
# Examples:
#   # push staging, wait for the api to redeploy, confirm a route resolves (401, not 404)
#   scripts/deploy-verify.sh --push staging \
#     --url https://api-staging-5287.up.railway.app/api/v1/auth/api-keys --expect-status 401
#   # just confirm prod health
#   scripts/deploy-verify.sh --url https://api.elleelephant.co.za/health --expect-text '"status":"ok"'
set -uo pipefail

URL="" ; EXPECT_STATUS="" ; EXPECT_TEXT="" ; TIMEOUT=600 ; INTERVAL=20 ; PUSH=""
while [ $# -gt 0 ]; do case "$1" in
  --url) URL="$2"; shift 2;;
  --expect-status) EXPECT_STATUS="$2"; shift 2;;
  --expect-text) EXPECT_TEXT="$2"; shift 2;;
  --timeout) TIMEOUT="$2"; shift 2;;
  --interval) INTERVAL="$2"; shift 2;;
  --push) PUSH="$2"; shift 2;;
  -h|--help) sed -n '2,15p' "$0"; exit 0;;
  *) echo "unknown arg: $1"; exit 2;;
esac; done

[ -z "$URL" ] && { echo "✖ missing --url"; exit 2; }
# default expectation: a healthy 2xx
[ -z "$EXPECT_STATUS" ] && [ -z "$EXPECT_TEXT" ] && EXPECT_STATUS=200

if [ -n "$PUSH" ]; then
  printf '\033[1m▶ pushing %s …\033[0m\n' "$PUSH"
  git push origin "$PUSH" || { echo "✖ push failed"; exit 1; }
fi

want=""
[ -n "$EXPECT_STATUS" ] && want="HTTP $EXPECT_STATUS"
[ -n "$EXPECT_TEXT" ] && want="${want:+$want + }body~/$EXPECT_TEXT/"
printf '\033[1m▶ polling %s for %s (every %ss, up to %ss)…\033[0m\n' "$URL" "$want" "$INTERVAL" "$TIMEOUT"

elapsed=0
while [ "$elapsed" -lt "$TIMEOUT" ]; do
  resp=$(curl -s -m 15 -w $'\n%{http_code}' "$URL" 2>/dev/null)
  code=$(printf '%s' "$resp" | tail -1)
  body=$(printf '%s' "$resp" | sed '$d')
  ok=1
  [ -n "$EXPECT_STATUS" ] && [ "$code" != "$EXPECT_STATUS" ] && ok=0
  [ -n "$EXPECT_TEXT" ] && ! printf '%s' "$body" | grep -q -- "$EXPECT_TEXT" && ok=0
  if [ "$ok" -eq 1 ]; then
    printf '\033[1;32m✅ verified at +%ss (HTTP %s)\033[0m\n' "$elapsed" "$code"
    exit 0
  fi
  printf '  +%ss: HTTP %s — not yet\n' "$elapsed" "$code"
  sleep "$INTERVAL"; elapsed=$((elapsed + INTERVAL))
done
printf '\033[1;31m❌ timeout after %ss (last HTTP %s)\033[0m\n' "$TIMEOUT" "${code:-?}"
exit 1
