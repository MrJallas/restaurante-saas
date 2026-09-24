#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="${OUT_DIR:-$ROOT_DIR/output/idb}"
TENANT_SLUG="${TENANT_SLUG:-restaurant_dev}"
CUSTOMER_BASE_URL="${CUSTOMER_BASE_URL:-http://localhost:3003/$TENANT_SLUG}"
STAFF_BASE_URL="${STAFF_BASE_URL:-http://localhost:3002}"
TARGET_UDID="${TARGET_UDID:-}"
PAUSE_SECONDS="${PAUSE_SECONDS:-3}"
ASSERT_UI="${ASSERT_UI:-1}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing command: $1" >&2
    exit 1
  fi
}

choose_target() {
  idb list-targets --json | python3 -c '
import json, sys
targets = []
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        targets.append(json.loads(line))
    except json.JSONDecodeError:
        pass
booted = [t for t in targets if t.get("state") == "Booted" and "iPhone" in t.get("name", "")]
bootable = [t for t in targets if "iPhone" in t.get("name", "")]
pick = (booted or bootable or targets)[0] if targets else None
if not pick:
    raise SystemExit("No iOS target found")
print(pick["udid"])
'
}

safe_name() {
  echo "$1" | tr '/:?&=' '------' | tr -cs '[:alnum:]_.-' '-'
}

capture() {
  local name="$1"
  local expected_pattern="${2:-}"
  local file
  file="$(safe_name "$name")"
  idb screenshot --udid "$TARGET_UDID" "$OUT_DIR/${file}.png" >/dev/null
  idb ui describe-all --udid "$TARGET_UDID" --json > "$OUT_DIR/${file}.ui.json" || true
  assert_capture "$name" "$OUT_DIR/${file}.png" "$OUT_DIR/${file}.ui.json" "$expected_pattern"
}

assert_capture() {
  local name="$1"
  local screenshot="$2"
  local ui_tree="$3"
  local expected_pattern="$4"

  if [[ "$ASSERT_UI" != "1" ]]; then
    return 0
  fi
  if [[ ! -s "$screenshot" ]]; then
    echo "ASSERT FAIL [$name]: screenshot vazia: $screenshot" >&2
    return 1
  fi
  if [[ ! -s "$ui_tree" ]]; then
    echo "ASSERT FAIL [$name]: UI tree vazia: $ui_tree" >&2
    return 1
  fi

  python3 - "$name" "$ui_tree" "$expected_pattern" <<'PY'
import json
import re
import sys

name, ui_path, expected = sys.argv[1], sys.argv[2], sys.argv[3]

try:
    with open(ui_path, "r", encoding="utf-8") as handle:
        tree = json.load(handle)
except Exception as exc:
    print(f"ASSERT FAIL [{name}]: UI tree invalida: {exc}", file=sys.stderr)
    raise SystemExit(1)

texts = []

def walk(value):
    if isinstance(value, dict):
        for key in ("AXLabel", "AXValue", "title", "role_description"):
            item = value.get(key)
            if isinstance(item, str) and item.strip():
                texts.append(item.strip())
        for item in value.values():
            walk(item)
    elif isinstance(value, list):
        for item in value:
            walk(item)

walk(tree)
text = "\n".join(texts)

bad_patterns = [
    r"Safari não pode abrir",
    r"não foi possível conectar",
    r"This site can.?t be reached",
    r"\bERR_[A-Z0-9_]+\b",
    r"em desenvolvimento",
    r"Onda\s+[0-9]+\s+backend",
    r"x-staff-id",
    r"xstaff",
    r"manager-only endpoint",
    r"Thread\s+(não|nao)\s+encontrada",
]

for pattern in bad_patterns:
    if re.search(pattern, text, re.I):
        print(f"ASSERT FAIL [{name}]: padrao proibido encontrado: {pattern}", file=sys.stderr)
        raise SystemExit(1)

if expected and not re.search(expected, text, re.I):
    print(f"ASSERT FAIL [{name}]: nao encontrou padrao esperado: {expected}", file=sys.stderr)
    raise SystemExit(1)
PY
}

open_and_capture() {
  local name="$1"
  local url="$2"
  local expected_pattern="${3:-}"
  local failed=0
  echo "==> $name: $url"
  idb open --udid "$TARGET_UDID" "$url"
  sleep "$PAUSE_SECONDS"
  capture "$name" "$expected_pattern" || failed=1

  # Common audit taps: top-left back/menu, top-right notifications/menu, and
  # the four bottom navigation zones. These are intentionally coordinate-based
  # because idb has no cross-browser label tap for Safari web content.
  for point in "32 72 top-left" "360 72 top-right" "62 812 nav-1" "156 812 nav-2" "250 812 nav-3" "344 812 nav-4"; do
    read -r tap_x tap_y tap_name <<< "$point"
    idb ui tap --udid "$TARGET_UDID" "$tap_x" "$tap_y" || true
    sleep 1
    capture "$name-$tap_name" || failed=1
  done
  return "$failed"
}

require_cmd idb
require_cmd python3

mkdir -p "$OUT_DIR"

if [[ -z "$TARGET_UDID" ]]; then
  TARGET_UDID="$(choose_target)"
fi

echo "Using target $TARGET_UDID"
idb boot --udid "$TARGET_UDID" >/dev/null 2>&1 || true
idb focus --udid "$TARGET_UDID" >/dev/null 2>&1 || true

{
  echo "# IDB UI Audit"
  echo
  echo "- Target: $TARGET_UDID"
  echo "- Customer base: $CUSTOMER_BASE_URL"
  echo "- Staff base: $STAFF_BASE_URL"
  echo "- Assertions: screenshot/UI tree non-empty + forbidden visible strings after each open/tap"
  echo "- Started at: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
} > "$OUT_DIR/summary.md"

CUSTOMER_ROUTES=(
  "customer-home|$CUSTOMER_BASE_URL"
  "customer-assistente|$CUSTOMER_BASE_URL/assistente"
  "customer-cardapio|$CUSTOMER_BASE_URL/cardapio"
  "customer-pedido|$CUSTOMER_BASE_URL/pedido"
  "customer-conta|$CUSTOMER_BASE_URL/conta"
  "customer-eu|$CUSTOMER_BASE_URL/eu"
)

STAFF_ROUTES=(
  "host-home|$STAFF_BASE_URL/host?tenant=$TENANT_SLUG"
  "host-waitlist|$STAFF_BASE_URL/host/waitlist?tenant=$TENANT_SLUG"
  "host-reservations|$STAFF_BASE_URL/host/reservations?tenant=$TENANT_SLUG"
  "waiter-home|$STAFF_BASE_URL/waiter?tenant=$TENANT_SLUG"
  "waiter-calls|$STAFF_BASE_URL/waiter/chamados?tenant=$TENANT_SLUG"
  "waiter-profile|$STAFF_BASE_URL/waiter/eu?tenant=$TENANT_SLUG"
  "kitchen-kds|$STAFF_BASE_URL/cozinha"
  "manager-home|$STAFF_BASE_URL/manager?slug=$TENANT_SLUG"
  "manager-ops|$STAFF_BASE_URL/manager/operacoes?slug=$TENANT_SLUG"
  "manager-staff|$STAFF_BASE_URL/manager/equipe?slug=$TENANT_SLUG"
  "manager-settings|$STAFF_BASE_URL/manager/configuracoes?slug=$TENANT_SLUG"
)

for entry in "${CUSTOMER_ROUTES[@]}" "${STAFF_ROUTES[@]}"; do
  IFS='|' read -r name url <<< "$entry"
  if open_and_capture "$name" "$url"; then
    echo "- [x] $name" >> "$OUT_DIR/summary.md"
  else
    echo "- [ ] $name failed" >> "$OUT_DIR/summary.md"
  fi
done

echo "- Finished at: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$OUT_DIR/summary.md"
echo "Audit evidence saved to $OUT_DIR"
