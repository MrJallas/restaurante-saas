#!/usr/bin/env bash
set -euo pipefail

AUDIT_URL="${AUDIT_URL:-http://localhost:3003}"
SERVE_SIM_PORT="${SERVE_SIM_PORT:-3200}"
SERVE_SIM_PACKAGE="${SERVE_SIM_PACKAGE:-serve-sim@0.1.44}"

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
  echo "serve-sim requer macOS em Apple Silicon (arm64)." >&2
  exit 1
fi
for command_name in node npx xcrun python3; do
  command -v "$command_name" >/dev/null || { echo "Dependência ausente: $command_name" >&2; exit 1; }
done
xcrun simctl help >/dev/null

IOS_SIM_ID="${IOS_SIM_ID:-$(xcrun simctl list devices booted -j | python3 -c 'import json,sys; data=json.load(sys.stdin); print(next((d["udid"] for devices in data["devices"].values() for d in devices if d.get("state")=="Booted" and "iPhone" in d.get("name", "")), ""))')}"
if [[ -z "$IOS_SIM_ID" ]]; then
  IOS_SIM_ID="$(xcrun simctl list devices available -j | python3 -c 'import json,sys; data=json.load(sys.stdin); print(next((d["udid"] for devices in reversed(list(data["devices"].values())) for d in devices if d.get("isAvailable") and "iPhone" in d.get("name", "")), ""))')"
  [[ -n "$IOS_SIM_ID" ]] || { echo "Nenhum iPhone Simulator disponível. Instale um runtime pelo Xcode." >&2; exit 1; }
  xcrun simctl boot "$IOS_SIM_ID"
  open -a Simulator
  xcrun simctl bootstatus "$IOS_SIM_ID" -b
fi

xcrun simctl openurl "$IOS_SIM_ID" "$AUDIT_URL"
echo "Simulator: $IOS_SIM_ID"
echo "App auditado: $AUDIT_URL"
echo "Preview: http://localhost:$SERVE_SIM_PORT"
exec npx --yes "$SERVE_SIM_PACKAGE" "$IOS_SIM_ID" --port "$SERVE_SIM_PORT"
