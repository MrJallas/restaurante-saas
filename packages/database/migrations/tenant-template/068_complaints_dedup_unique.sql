-- 068 (re-scan #8, P1 retry-safety): idempotência do POST /:slug/complaints.
--
-- Bug: ComplaintsService.create() faz INSERT cru em complaints (status
-- 'pending_review') sem dedup. A tabela nunca teve UNIQUE (mig 026 só criou
-- índices NÃO-únicos). Contraste com o irmão order_ratings, que TEM
-- idx_order_ratings_unique_order e é idempotente por order.
--
-- Vetor de retry: ScreenCustomerComplaintCompose guarda `submitting`, mas o
-- catch do api() libera de volta. O client dá timeout em 15s → se o servidor
-- gravou a complaint mas a resposta demorou (rede lenta / GC pause), o cliente
-- re-envia o MESMO payload → 2ª complaint idêntica. Cada INSERT dispara
-- emitComplaintReceived pro gerente → fila poluída, contadores/SLA inflados
-- (severidade menor que order_ratings — não cobra 2x — mas mesma classe/vetor).
--
-- Modelagem da dedup (espelha order_ratings, mas escopada à janela ABERTA):
--   • Caso dominante — complaint DE UM PEDIDO (composer chega via
--     `?orderId=...`, e o createFromRating interno sempre passa order_id):
--     UNIQUE parcial em (order_id, customer_id) WHERE status='pending_review'
--     AND order_id IS NOT NULL. É order_ratings-like, mas só enquanto a
--     complaint está ABERTA — depois de respondida/fechada o cliente pode
--     legitimamente abrir OUTRA sobre o mesmo pedido (reclamação recorrente),
--     então não usamos UNIQUE global por order (isso quebraria o caso real).
--     O par com customer_id preserva multi-tenant/multi-cliente: dois clientes
--     da mesma mesa podem reclamar do mesmo pedido compartilhado.
--   • Caso "reclamação geral da mesa" SEM pedido, mas COM visita resolvida
--     server-side: UNIQUE parcial em (visit_id, customer_id) WHERE
--     status='pending_review' AND order_id IS NULL AND visit_id IS NOT NULL.
--     Fecha o retry da queixa geral quando há visit_id (o composer manda
--     session.visitId; o server resolve via session_participants quando falta).
--   • Sub-caso SEM order E SEM visit (queixa anônima/pré-join): fica SEM dedup
--     de propósito — não há chave estável de "mesma queixa" (texto livre não
--     é chave), e o volume é marginal. Documentado aqui como decisão.
--
-- Efeito no caminho interno createFromRating (order-ratings): ele sempre passa
-- order_id + customer_id e NÃO passa tableSessionId. Já é protegido a montante
-- pelo idx_order_ratings_unique_order (um rating por order → uma chamada por
-- order), então o índice novo NÃO o afeta no fluxo normal. Se por corrida ele
-- disparasse 2x, o ON CONFLICT DO NOTHING + fallback-SELECT da camada de
-- aplicação devolve a complaint existente (idempotente) em vez de estourar.
--
-- Idempotente: IF NOT EXISTS em ambos os índices; prólogo de dedupe roda 0
-- linhas se já limpo.

-- DEDUPE defensivo antes dos índices (padrão canônico 040/057/063/064): um
-- tenant legado que JÁ sofreu o retry que estes índices fecham tem >1 complaint
-- 'pending_review' pra mesma chave. Sem este prólogo, o CREATE UNIQUE INDEX
-- estouraria unique_violation (23505) e — como migration é FATAL no boot — a API
-- não subiria nesse tenant. Fechamos as duplicatas MAIS ANTIGAS marcando-as como
-- 'closed' (semântica canônica: closed_at/resolved_at/updated_at), mantendo a
-- MAIS RECENTE 'pending_review' viva. Não deletamos: complaints pode ser alvo de
-- FKs (escalation_chains linka via complaints.escalation_chain_id, mas o inverso
-- também pode existir em audit) e o histórico do gerente importa — fechar é mais
-- seguro que apagar. Só considera as chaves que os índices cobrem.

-- (a) duplicatas por (order_id, customer_id) na janela pending_review.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY order_id, customer_id
           ORDER BY submitted_at DESC, id DESC
         ) AS rn
    FROM complaints
   WHERE status = 'pending_review'
     AND order_id IS NOT NULL
     AND customer_id IS NOT NULL
)
UPDATE complaints c
   SET status      = 'closed',
       closed_at   = COALESCE(c.closed_at, now()),
       resolved_at = COALESCE(c.resolved_at, now()),
       updated_at  = now()
  FROM ranked r
 WHERE c.id = r.id
   AND r.rn > 1;

-- (b) duplicatas por (visit_id, customer_id) SEM order_id na janela pending_review.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY visit_id, customer_id
           ORDER BY submitted_at DESC, id DESC
         ) AS rn
    FROM complaints
   WHERE status = 'pending_review'
     AND order_id IS NULL
     AND visit_id IS NOT NULL
     AND customer_id IS NOT NULL
)
UPDATE complaints c
   SET status      = 'closed',
       closed_at   = COALESCE(c.closed_at, now()),
       resolved_at = COALESCE(c.resolved_at, now()),
       updated_at  = now()
  FROM ranked r
 WHERE c.id = r.id
   AND r.rn > 1;

-- Índice (a): uma complaint ABERTA por (order_id, customer_id).
CREATE UNIQUE INDEX IF NOT EXISTS idx_complaints_pending_unique_order
  ON complaints (order_id, customer_id)
  WHERE status = 'pending_review'
    AND order_id IS NOT NULL
    AND customer_id IS NOT NULL;

-- Índice (b): uma complaint ABERTA por (visit_id, customer_id) quando não há order.
CREATE UNIQUE INDEX IF NOT EXISTS idx_complaints_pending_unique_visit
  ON complaints (visit_id, customer_id)
  WHERE status = 'pending_review'
    AND order_id IS NULL
    AND visit_id IS NOT NULL
    AND customer_id IS NOT NULL;
