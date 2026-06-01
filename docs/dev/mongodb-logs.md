# MongoDB para Logs e Históricos

Diretriz do round 24: logs e históricos novos devem ir para MongoDB, não para
Postgres. Postgres segue como fonte relacional transacional; Mongo armazena
trilhas de auditoria, histórico de eventos e material de investigação.

## Setup local

O `docker-compose.yml` já inclui `restaurant-mongodb` com MongoDB 7. O serviço
não publica porta no host; use a rede do compose ou `docker exec`.

```bash
docker compose up -d mongodb
docker exec restaurant-mongodb mongosh restaurant_chat --quiet --eval 'db.adminCommand({ ping: 1 }).ok'
```

Variáveis usadas pela API:

- `MONGODB_URI=mongodb://mongodb:27017`
- `MONGODB_DB=restaurant_chat`
- `MONGODB_SECURITY_DB=restaurant_security`

Fora do compose, use:

```bash
MONGODB_URI=mongodb://localhost:27017 npm --workspace packages/database run mongo:init
```

## Collections de logs

No database `restaurant_chat`:

- `shift_logs`: encerramento de turno, decisões do gerente e mudanças futuras de escala.
- `notifications_log`: notificações enviadas, push e UI.
- `kitchen_calls`: chamados cozinha para garçom.
- `merge_requests_history`: junções de mesa, incluindo expiradas.
- `priority_requests_history`: pedidos de puxar para frente.
- `complaints_archive`: reclamações arquivadas após resolução.

No database `restaurant_security`:

- `security_audit_events`: ações sensíveis de staff.
- `qr_scan_events`: leitura e validação de QR.
- `scan_verification_events`: eventos de aprovação/rejeição de scan.

## Collection usada neste prompt

`apps/api/src/modules/shifts/shifts.service.ts` grava `shift_logs` de forma
best-effort em dois pontos:

- `shift_end_requested`: garçom solicitou encerramento de turno.
- `shift_end_decided`: gerente aprovou ou recusou a solicitação.

Formato:

```json
{
  "tenantId": "restaurant_dev",
  "eventType": "shift_end_requested",
  "requestId": "uuid",
  "staffId": "uuid",
  "target": { "type": "staff_shift_end_requests", "id": "uuid" },
  "before": null,
  "after": { "status": "pending" },
  "timestamp": "2026-06-01T00:00:00.000Z"
}
```

## Índices

`packages/database/mongo-init.js` e
`packages/database/scripts/mongo-init.ts` garantem:

- `{ tenantId: 1, timestamp: -1 }`
- `{ staffId: 1, timestamp: -1 }`
- `{ requestId: 1, timestamp: -1 }`
- `{ eventType: 1, timestamp: -1 }`

Use sempre `timestamp` em ordem descendente para telas de auditoria e relatórios
recentes.
