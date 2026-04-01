#!/usr/bin/env bash
# Import KEY=VALUE lines from a .env-style file into a Railway service.
# Values are sent with `railway variable set KEY --stdin` so ${{MySQL.HOST}} and
# secrets are not mangled by the shell.
#
# Usage (from repo root, after `railway login` + `railway link`):
#   ./scripts/railway-import-env.sh <service-name> <path-to-env-file>
#
# Example:
#   railway link -p <project-id> -s foldwatch
#   ./scripts/railway-import-env.sh foldwatch .env.railway.backend
#
# Omit --skip-deploys on the last batch if you want one deploy; or redeploy after:
#   railway redeploy -s foldwatch

set -euo pipefail

SERVICE="${1:?Usage: $0 <railway-service-name> <env-file>}"
ENVFILE="${2:?Usage: $0 <railway-service-name> <env-file>}"

if ! command -v railway >/dev/null 2>&1; then
  echo "railway CLI not found. Install: https://docs.railway.com/cli" >&2
  exit 1
fi

if [[ ! -f "$ENVFILE" ]]; then
  echo "File not found: $ENVFILE" >&2
  exit 1
fi

while IFS= read -r raw || [[ -n "$raw" ]]; do
  line="${raw%$'\r'}"
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ -z "${line//[[:space:]]/}" ]] && continue
  if [[ "$line" != *"="* ]]; then
    echo "Skipping (no =): $line" >&2
    continue
  fi
  key="${line%%=*}"
  val="${line#*=}"
  key="${key%"${key##*[![:space:]]}"}"
  key="${key#"${key%%[![:space:]]*}"}"
  printf '%s' "$val" | railway variable set "$key" --stdin -s "$SERVICE" --skip-deploys
  echo "Set $key"
done < "$ENVFILE"

echo "Done. Run: railway redeploy -s $SERVICE  (or push to trigger deploy)"
