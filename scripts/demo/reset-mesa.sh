#!/bin/bash
# Fecha a sessão ativa de uma mesa pra recomeçar a demo do zero.
# Uso: bash scripts/demo/reset-mesa.sh M01
set -euo pipefail
MESA="${1:-M01}"
docker exec restaurant-postgres psql -U postgres -p 5434 -d restaurant_saas -c "
SET search_path TO restaurant_dev;
UPDATE table_sessions SET status='closed', closed_at=now()
 WHERE table_id=(SELECT id FROM tables WHERE code='$MESA') AND status<>'closed';" | tail -1
echo "✓ Mesa $MESA liberada. No celular: FECHAR a aba do Safari e escanear de novo."
