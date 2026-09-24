#!/bin/bash
# Reconfigura o stack de demo para a rede atual (hotspot do iPhone ou wi-fi do local).
# Uso:  bash scripts/demo/demo-fora-de-casa.sh [IP]
#       (sem argumento, detecta o IP do wi-fi do Mac via en0)
set -euo pipefail
cd "$(dirname "$0")/../.."

IP="${1:-$(ipconfig getifaddr en0 || true)}"
if [ -z "$IP" ]; then
  echo "❌ Não achei IP no en0. Conecte o Mac no wi-fi/hotspot e rode de novo (ou passe o IP: bash $0 <IP>)"
  exit 1
fi
echo "▶ IP da demo: $IP"

# 1. LM Studio local com o Gemma carregado (a IA roda no próprio Mac, sem internet)
if ! curl -fsS -m 3 http://localhost:1234/v1/models >/dev/null 2>&1; then
  echo "▶ Subindo LM Studio local..."
  ~/.lmstudio/bin/lms server start
fi
if ! curl -fsS -m 3 http://localhost:1234/v1/models 2>/dev/null | grep -q gemma-4-26b; then
  echo "▶ Carregando google/gemma-4-26b-a4b (~40s)..."
  ~/.lmstudio/bin/lms load google/gemma-4-26b-a4b --context-length 8192 -y
fi
echo "✓ LM Studio local ok"

# 2. PUBLIC_HOST -> IP novo (QR do cliente e CORS dependem disso)
grep -q "^PUBLIC_HOST=" .env && sed -i '' "s/^PUBLIC_HOST=.*/PUBLIC_HOST=$IP/" .env || echo "PUBLIC_HOST=$IP" >> .env
# Garante IA apontando pro LM Studio do Mac
grep -q "^LLM_BASE_URL=" .env && sed -i '' "s|^LLM_BASE_URL=.*|LLM_BASE_URL=http://host.docker.internal:1234/v1|" .env
echo "✓ .env atualizado (PUBLIC_HOST=$IP)"

# 3. Recria os containers que leem PUBLIC_HOST
docker compose up -d api web-customer web-staff ai-service
echo "▶ Aguardando API subir (migrations + boot)..."
until curl -fsS -m 2 http://localhost:3001/api/health >/dev/null 2>&1; do sleep 4; done
until curl -fsS -m 3 http://localhost:3003/restaurant_dev >/dev/null 2>&1; do sleep 4; done

# Auto-cura: cache .next podre (volume persistente) faz rota existente dar 404.
if [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3003/restaurant_dev/mesa/M01)" = "404" ]; then
  echo "▶ Cache do Next corrompido — limpando e reiniciando o web-customer..."
  docker exec restaurant-web-customer sh -c 'rm -rf /repo/apps/web-customer/.next/* 2>/dev/null' || true
  docker restart restaurant-web-customer >/dev/null
  until curl -fsS -m 3 http://localhost:3003/restaurant_dev >/dev/null 2>&1; do sleep 4; done
fi
echo "✓ Stack no ar (rota da mesa: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:3003/restaurant_dev/mesa/M01))"

# 4. Regenera o QR da Mesa 01 com o IP novo -> ~/Desktop/qr-mesa-01-demo.png
# tables.qr_public_token da M01: cada banco gera o seu, então consulta em vez de fixar.
QR_TOKEN=$(docker exec restaurant-postgres psql -U postgres -p 5434 -d restaurant_saas -tA \
  -c "SELECT qr_public_token FROM restaurant_dev.tables WHERE code = 'M01'")
[ -n "$QR_TOKEN" ] || { echo "❌ Mesa M01 não encontrada no restaurant_dev. Rodou o seed?"; exit 1; }
TMP=$(mktemp -d)
npx --yes qrcode -t svg -e M -o "$TMP/qr.svg" "http://$IP:3001/api/qr/$QR_TOKEN"
python3 - "$TMP" <<'PYEOF'
import sys
tmp = sys.argv[1]
svg = open(f'{tmp}/qr.svg').read()
tpl = open('scripts/demo/qr-card-template.html').read()
open(f'{tmp}/card.html','w').write(tpl.replace('{{QR_SVG}}', svg))
PYEOF
(cd apps/web-customer && npx playwright screenshot --viewport-size=1600,900 --full-page "file://$TMP/card.html" ~/Desktop/qr-mesa-01-demo.png >/dev/null 2>&1)
echo "✓ QR novo: ~/Desktop/qr-mesa-01-demo.png"

# 5. Smoke da IA ponta a ponta
docker exec restaurant-ai python -c "
import os, json, urllib.request
key=os.environ.get('AI_SERVICE_API_KEY','')
req=urllib.request.Request('http://localhost:8000/chat',
  data=json.dumps({'message':'oi!','session_id':'smoke-demo','tenant':'restaurant_dev','history':[]}).encode(),
  headers={'Content-Type':'application/json','X-AI-Service-Key':key})
d=json.loads(urllib.request.urlopen(req,timeout=120).read())
print('✓ IA respondendo | camada:',d.get('layer'),'| modelo:',d.get('model'))
"

# 6. Abre todas as telas da demo no Chrome + o QR no Preview
CHROME="Google Chrome"
open -a "$CHROME" "http://localhost:3002/login"                       # logar: Gerente 90000000001 / PIN 1234
open -a "$CHROME" "http://localhost:3002/manager/operacoes?tab=mapa"  # mapa do salão
open -a "$CHROME" "http://localhost:3002/waiter"
open -a "$CHROME" "http://localhost:3002/host"
open -a "$CHROME" "http://localhost:3002/cozinha"
open -a "$CHROME" "http://localhost:3002/bar"
open -a "$CHROME" "http://localhost:3002/cozinha/tv"
open ~/Desktop/qr-mesa-01-demo.png                                    # QR na tela pra escanear
echo "✓ Telas abertas no Chrome + QR no Preview"

echo ""
echo "════════════════════════════════════════════════════"
echo " DEMO PRONTA"
echo "  Cliente (QR novo no Desktop): http://$IP:3003"
echo "  Staff (neste Mac):  http://localhost:3002/login"
echo "  Gerente 90000000001 · Recepção ...02 · Garçom ...03 · Cozinha ...04 · PIN 1234"
echo "  TVs: http://localhost:3002/cozinha/tv  e  /bar/tv"
echo "  1º passo no Chrome: logar na aba /login como Gerente — as telas de"
echo "  garçom/recepção/cozinha usam a mesma sessão (F5 nelas após logar)."
echo "  Celular do cliente precisa estar NA MESMA rede do Mac."
echo "════════════════════════════════════════════════════"
