# Auditoria mobile com serve-sim

## Decisão durável

Nas próximas auditorias, use `serve-sim` para permitir que o agente veja e
opere um iOS Simulator pelo navegador. No Restaurante SaaS esta é uma camada
complementar ao Playwright: o fluxo principal continua sendo auditado no web,
mas os caminhos críticos do cliente também devem ser verificados no Safari do
iOS Simulator.

## Entrada oficial

```bash
scripts/audit/start-serve-sim.sh
```

Variáveis opcionais:

```bash
AUDIT_URL=http://localhost:3003/restaurant_dev/mesa/1 \
IOS_SIM_ID=<udid> \
SERVE_SIM_PORT=3200 \
scripts/audit/start-serve-sim.sh
```

O script verifica macOS/Apple Silicon, Node, Xcode e simuladores; inicia um
iPhone disponível se nenhum estiver ligado; abre `AUDIT_URL` no Safari; e
executa uma versão fixada do `serve-sim`. Para atualizar conscientemente a
versão, sobrescreva `SERVE_SIM_PACKAGE` e valide todo o launcher antes de mudar
o padrão.

## Fluxos prioritários

- QR/geolocalização, welcome e retomada de sessão;
- home da mesa, cardápio, assistente e chips;
- draft, revisão, confirmação e acompanhamento do pedido;
- chamar garçom, mensagens, compartilhamento de mesa e late-arrival;
- pagamento, divisão, Pix, erro, feedback e LGPD;
- teclado, foco, rolagem, sheets, safe areas e rotação.

## Evidência mínima por achado

Registre commit, ambiente, modelo/UDID e versão do iOS, conta/dados de teste,
passos de reprodução, esperado versus observado, screenshot ou gravação curta,
logs relevantes, severidade e impacto. Evidências pesadas ficam locais; no Git,
commite apenas resumos e manifests pequenos.

## Segurança e limite

Não exponha a porta `3200` diretamente à internet. Em Mac remoto, use túnel
SSH autenticado ou rede privada. Use somente dados de teste. O Simulator não é
prova suficiente para desempenho, memória, câmera, sensores, notificações ou
outros comportamentos de hardware; confirme esses achados em iPhone físico.
