# Auditoria integral `/loop` — resultado final

Data: 2026-07-11  
Worktree: `/Users/calebmedeiros/meus_projetos/restauranteSaaS-framework-bugfixes`  
Branch: `fix/framework-bugfixes` (continuação da PR #65 e do trabalho Fable)

## Veredito

**PARTIAL — score técnico 96/100, bloqueio de segurança aceito.** A auditoria
original terminou em PASS, mas a decisão posterior de 2026-07-11 permite login
somente por CPF. Isso introduz um risco alto conhecido de account takeover e,
pela própria regra RQS, impede classificação PASS enquanto estiver ativo.

Builds, fluxos e testes continuam verdes; PARTIAL aqui não é falha técnica
oculta, mas a representação honesta de uma escolha temporária de produto.

O PASS é para o comportamento web/API validado localmente. Ele não transforma
serve-sim/WebKit em prova de desempenho, câmera, GPS, haptics ou sensores de um
iPhone físico, nem afirma que Pix cobra dinheiro real.

## RQS

| Dimensão | Pontos | Evidência |
| --- | ---: | --- |
| Build, tipos, lint, migrations e diff | 15/15 | Builds Nest/Next/TS e migrations 073–079; lint forçado, Prettier e diff verdes |
| E2E crítico | 24/25 | QR, reserva, fila, aprovação, pedidos, KDS, garçom, pagamentos, LGPD e noite real; sem aparelho físico |
| API, dados e segurança | 20/20 técnico | RBAC, tenant, ownership, CAS, locks e stores cobertos; CPF-only é exceção aceita que bloqueia PASS |
| UI por persona | 14/15 | Cliente, recepção, garçom, gerente, dono, cozinha, bar e caixa; falta passada física completa |
| Wire/mock/placebo | 10/10 | CTAs finais fazem ação real ou declaram explicitamente a indisponibilidade |
| Evidência/reprodução | 10/10 | Relatórios, traces/network, before/after no banco e specs reproduzíveis |
| Performance/flakiness | 3/5 | Carga de garçons e E2E repetido; sem teste de produção/aparelho e com HMR dev observado |
| **Total técnico** | **96/100** | Classificação PARTIAL por risco alto conhecido, independentemente do score |

## O que foi entregue

### Dono e gestão

- Dashboard do dono preservado com métricas reais, navegação operacional e
  acesso por papel.
- Nova configuração exclusiva do estabelecimento: nome, timezone, moeda, taxa,
  geofence, ETA de cozinha e horários.
- Autorização owner-only no backend e frontend; manager recebe 403 e não vê o
  menu exclusivo.
- Concorrência otimista entre dispositivos: save com versão, conflito 409,
  reload da versão atual e no-op sem PATCH.
- Monitor de carga distribui cada sessão uma única vez, identifica desequilíbrio
  real, cria alerta singleton manager-only e resolve sem duplicar mesas.

### Operação do restaurante

- QR irregular sem liberação chega à recepção em realtime e escala para gerente
  e garçom; o ator que perdeu a atribuição não mantém CTA ativo.
- Reserva e fila só ficam sentadas/liberadas na confirmação atômica; dados de
  mesa e grupo não são inventados entre telas.
- Cliente anfitrião aprova participante em realtime; falha/loading permanecem
  fail-closed.
- Pedidos concorrentes usam idempotência durável e locks; KDS avança por item e
  estação, sem o bar concluir a cozinha ou vice-versa.
- `prep_started_at` é o relógio por item da cozinha. ETA e atraso não usam
  `orders.updated_at`; quantidade aparece como carga, sem inventar capacidade.
- Garçom recebe chamados/entregas de fontes independentes e não perde uma lista
  quando a outra falha.
- Bartender entra em `/bar`; `/bar/tv` continua display compartilhado com PIN.
- Caixa entra em `/cashier`, uma superfície segura e honesta sem mutações
  financeiras enquanto o produto de liquidação não estiver definido.

### Cliente, dinheiro e privacidade

- A identidade pessoal nunca vem do customerId compartilhado da mesa. Porém,
  por decisão temporária, um CPF conhecido em `welcome`/`identify` emite o
  cookie canônico e libera histórico/PII — risco de takeover aceito e logado.
- Rateio usa o mesmo escopo financeiro do backend e reconcilia centavos:
  `9.113 + 2.514 = 11.627`.
- Corridas de pagamento, split e conta inteira não criam dupla reserva/cobrança.
- Confirmação de pagamento pelo cliente é ignorada em produção/staging; Pix
  permanece demonstrativo e não afirma liquidação.
- Feedback exige pagamento confirmado e visita pertencente ao cliente.
- LGPD só começa no botão autenticado do browser. O LLM não apaga, não cria
  protocolo e não afirma sucesso. Lease + attempt token tornam o job retomável
  e impedem conclusão por tentativa antiga.
- Fulfillment remove/anonymiza Postgres/Mongo/Redis, rotaciona bearer, invalida
  cache/cookies e desconecta sockets customer.

### Segurança, arquitetura e manutenção

- Segredo de sessão obrigatório fora de test/dev, RBAC/ownership server-side,
  isolamento tenant e rooms WebSocket revalidados.
- CPF-only mantém rate-limit e bearer apenas em cookie HttpOnly, mas nenhuma
  dessas medidas transforma CPF em prova de posse.
- Autor de staff é derivado do token revalidado; ids e `changedBy` do cliente
  não concedem identidade.
- Transições, seating, pagamentos, alertas e erasure usam CAS/locks/transações
  nas fronteiras de concorrência.
- AI usa lifespan FastAPI, locks Python 3.11 separados para produção/teste e
  imagem Docker de produção sem pytest.
- Dependência Webpack duplicada/vulnerável removida com `npm audit fix` sem
  `--force`.
- O E2E real encontrou um `42P08` que os fakes não viam: `$1` era inferido como
  `varchar` e `text` no update do KDS. O SQL agora tipa o parâmetro, há teste de
  regressão e a noite foi repetida com login real de cozinheiro.

## Gates finais

Cada uma das duas rodadas finais executou:

- API: **152/152 suites, 935/935 testes**.
- Web customer: **32/32 suites, 167/167 testes**.
- Web staff: **23/23 suites, 87/87 testes**.
- AI: **408/408 testes**.
- Total: **1.597 testes por rodada**.
- `npm run format:check`, `git diff --check`, Turbo lint `--force` e Turbo build
  `--force`: PASS, zero cache nos gates forçados.
- Playwright WebKit/iPhone 14: noite com três clientes, recepção, garçom,
  gerente, cozinheiro e histórico: PASS em 51,1 s e 48,4 s; o teardown deixou
  zero sessão, liberação, scan, pedido ou chamado operacional ativo nas mesas
  de teste nas duas rodadas.
- `pip-audit` no lock de produção: zero vulnerabilidades conhecidas.
- `npm audit`: zero HIGH/CRITICAL; duas MODERATE do PostCSS interno do Next.

Detalhes: [ROUND-1.md](ROUND-1.md), [ROUND-2.md](ROUND-2.md),
[PLAYWRIGHT.md](PLAYWRIGHT.md), [SECURITY.md](SECURITY.md) e
[SCENARIO-MATRIX.md](SCENARIO-MATRIX.md).

### Adendo após a decisão CPF-only

As duas rodadas acima registram o gate anterior à exceção de produto. Depois de
implementar o CPF-only explicitamente aceito, foi executado um gate adicional:

- API: **153/153 suítes, 940/940 testes**.
- Web customer: **32/32 suítes, 167/167 testes**.
- Turbo lint e Turbo build: **PASS**.
- Testes focados cobrem CPF existente sem cookie, cookie divergente, token
  somente HttpOnly, concorrência de cadastro, contagem idempotente de visitas e
  ausência do bearer no JSON.
- A classificação permanece **PARTIAL**, pois teste verde não elimina o risco
  de tomada de conta por alguém que conheça o CPF.

## Pendências e riscos aceitos

1. **CPF-only em aparelho novo/cookies apagados:** decisão tomada: quem souber o
   CPF entra. Isso bloqueia o PASS de segurança até ser substituído por OTP em
   canal verificado ou confirmação presencial, preferencialmente com credencial
   por dispositivo e revogação individual.
2. **Caixa real:** `/cashier` é um holding seguro. Falta definir se o caixa
   liquida presencialmente, apenas monitora pendências ou fica desativado.
3. **Pix:** demonstração explícita, sem PSP/webhook/chargeback/reconciliação
   bancária.
4. **SLA do bar:** não há `bar_eta_*` persistido. Dashboard chama de atrasado
   apenas o que excede o target configurável da cozinha.
5. **Dependência Next/PostCSS:** duas MODERATE permanecem dentro de
   `next@16.2.10`; a única sugestão do npm é `--force` para Next 9.3.3, um
   downgrade incompatível, portanto foi rejeitada.
6. **Deploy:** Compose é ambiente de desenvolvimento, não arquitetura de
   produção. Faltam secrets manager, TLS/ingress, backup/restore testado,
   observabilidade e rollout.
7. **Performance/hardware:** serve-sim e WebKit não provam aparelho físico nem
   carga de produção. Capacidade/paralelismo do ETA ainda é constante de
   domínio, não modelo configurável.

## Estado de entrega

As alterações permanecem **não commitadas e não publicadas** no worktree acima.
Nenhum arquivo do checkout-base e nenhum Simulator/iPhone de outro chat foi
usado; a auditoria móvel ficou nos perfis `Romantico-*` e porta 3202.
