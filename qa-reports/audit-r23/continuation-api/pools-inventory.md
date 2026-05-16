# Continuation pools — inventory

Source: `services/ai-service/services/continuation.py` (DEFAULTS dict).

## Canon kinds (V20 — 5 kinds × 4 variants + 1 fallback kind)

| Kind | Variants (id) | Slots | requires_slots (Round 19 C1) | weight | chips/primary_cta |
|---|---|---|---|---|---|
| `viu_menu` | `vm1` | — | — | 1.0 | 4 chips |
| | `vm2` | customerName | customerName | 1.0 | 4 chips |
| | `vm3` | — | — | 1.0 | 4 chips |
| | `vm4` | — | — | 0.8 | 4 chips |
| `chamou_garcom` | `cg1` | — | — | 1.0 | 4 chips |
| | `cg2` | customerName | customerName | 1.0 | 4 chips |
| | `cg3` | — | — | 1.0 | 4 chips |
| | `cg4` | waitMinutes | waitMinutes | 0.8 | 4 chips |
| `abriu_pedido` | `ap1` | — | — | 1.0 | 4 chips + primary_cta `navigate:pedido` |
| | `ap2` | customerName | customerName | 1.0 | 4 chips + primary_cta |
| | `ap3` | — | — | 1.0 | 4 chips + primary_cta |
| | `ap4` | customerName, waitMinutes | customerName, waitMinutes | 0.8 | 4 chips + primary_cta |
| `pagou` | `pg1` | customerName | customerName | 1.0 | 4 chips |
| | `pg2` | — | — | 1.0 | 4 chips |
| | `pg3` | customerName | customerName | 1.0 | 4 chips |
| | `pg4` | — | — | 0.8 | 4 chips |
| `voltou_sem_acao` | `vs1` | last_item | last_item | 1.0 | 4 chips |
| | `vs2` | customerName, last_item | customerName, last_item | 1.0 | 4 chips |
| | `vs3` | — | — | 1.0 | 4 chips |
| | `vs4` | customerName | customerName | 1.0 | 4 chips |
| `pos_reclamacao` | `pc1` | managerName, avgResponseMin | managerName, avgResponseMin | 1.0 | 3 chips · subtitle "SUA RECLAMAÇÃO ESTÁ COM A GERENTE" |
| | `pc2` | managerName, avgResponseMin | managerName, avgResponseMin | 1.0 | 3 chips |
| | `pc3` | managerName, avgResponseMin | managerName, avgResponseMin | 1.0 | 3 chips · subtitle "RECLAMAÇÃO ENCAMINHADA" |
| | `pc_fallback` | — | — | 0.5 | 2 chips · subtitle "RECLAMAÇÃO RECEBIDA" |

## Other (non-V20) segments still in pool

| Segment | Variants | Notes |
|---|---|---|
| `returning:regular` | `r1` (customerName, favoriteItem), `r2` (customerName) | legacy `idle_nudge` |
| `returning:vip` | `v1` (customerName), `v2` (customerName, favoriteItem) | VIP tone (per `vip-customer.md`) |
| `new:regular` | `n1` (—) | first-time bem-vindo |
| `pos_rating_positive` | `prp1` (customerName) | post-rating |
| `pos_rating_neutral` | `prn1` (—) | post-rating |
| `pos_join_approved` | `pja1` (tableLabel) | late-arrival approved |
| `pos_merge_approved` | `pma1` (—) | merge approved |

## Total

- **5 V20 canon kinds × 4 variants = 20 templates** + `pos_reclamacao` (3 rich + 1 fallback = 4) + 7 legacy segments = **31 templates across 12 segments**.
- Round 19 C1 filter (`requires_slots`) excludes rich variants when slots absent → falls back to slot-free variants.
- Round 4 C-NEW-4 special case: `voltou_sem_acao` without `last_item` swaps template to neutral copy ("Bem-vindo de volta. Posso sugerir algo novo ou mostrar o cardápio do dia?") in `render_continuation`.
