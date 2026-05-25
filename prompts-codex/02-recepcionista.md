# Round 24 — Bugs do app da recepcionista/host (`apps/web-staff/src/app/host`)

## Contexto do projeto

Este é o monorepo `restauranteSaaS`. O app da recepcionista (host) faz parte do `apps/web-staff` na rota `/host`. Ela faz check-in dos clientes (valida QR + presença física), gerencia lista de espera, reservas e mesas.

### Modelo de segurança do QR

Documento de referência: `docs/design-canvas/docs/features/customer-host-model.md`

Toda entrada de cliente via QR físico passa por verificação manual da recepcionista — ela vai até a mesa e confirma presença física (mitiga screenshot/foto do QR). Sem essa validação, cliente não entra.

### Canvas (source-of-truth visual)

- `docs/design-canvas/handoff/garcom/garcom-screens-host.jsx` (telas compartilhadas host)
- `docs/design-canvas/v5-host-tablemenu.png` (table menu do host)
- `docs/design-canvas/v11-host-eu-ios.png` (perfil "Eu" do host)
- `docs/design-canvas/handoff/cliente/cliente-table-merge.jsx` (referência de junção de mesas)
- `docs/design-canvas/handoff/cliente/cliente-late-arrival.jsx` (late arrival flow — referência)

---

## Bugs

### 1. Geolocalização — recepcionista precisa ver localização do cliente em metros

**Contexto**: O cliente vai ter geolocalização obrigatória pra entrar no app (ver `01-cliente.md` bug 1).

**Cenário atual**: Na tela "Verificar QR" (`/host/scan-verification/{scanId}`):
- Mostra "Mesa 1 · Caleb escaneou o QR da mesa"
- Texto INSPEÇÃO: "Va ate a mesa 1 e confirme se ha cliente sentado. CPF ***.***.***-58 - **localizacao prompt**."
- Hoje o "localização" é literalmente a string "prompt", **não mostra distância real**

**Esperado**:
- Card de INSPEÇÃO deve mostrar a localização real do cliente em **metros em relação ao centro do raio do restaurante**
- Se cliente está dentro do raio: badge verde "**dentro da área do restaurante**"
- Se fora ou negou: cliente nem chegou no app, então recepcionista não vai ver scan vindo dele (essa parte é tratada no cliente)
- Raio inicial: **3 metros** (configurável depois pelo gerente, pode hardcoded em env por enquanto)

**Componente API**: ver `06-api-transversais.md` bug 1 — endpoint que recebe scan precisa receber lat/long do cliente; endpoint da tela do host precisa retornar a distância calculada.

**Critério de aceitação**:
- [ ] Tela "Verificar QR" mostra distância em metros (ex.: "2,3m do centro do salão")
- [ ] Se dentro do raio: badge verde "dentro da área do restaurante"

---

### 2. Cards de status do dashboard não são clicáveis

**Cenário**: Dashboard inicial da recepcionista mostra 4 cards no topo:
- ATENÇÃO (0)
- LIBERADAS (0)
- EM USO (2)
- LIVRES (12)

**Atual**: Cards **não são clicáveis**.

**Esperado**:
- Cada card vira **botão** que leva a uma tela dedicada com a lista filtrada:
  - ATENÇÃO → lista de mesas/clientes que precisam de atenção
  - LIBERADAS → lista de mesas recém-liberadas
  - EM USO → lista de mesas em uso (filtro do dashboard)
  - LIVRES → lista de mesas livres
- Telas já existem no canvas

**Ação**: Procurar no canvas os arquivos `screens.jsx`, `screens-extra.jsx`, `v5-host-tablemenu.png` — identificar as 4 telas correspondentes e wirar.

**Critério de aceitação**:
- [ ] Cada um dos 4 cards navega pra tela correspondente
- [ ] Telas batem com o canvas

---

### 8. Lista de espera — não consigo clicar no card/avatar pra atender

**Cenário**: Tela "Lista de espera · 4 ESPERANDO" mostra:
- 2: João UI · 14099 min  ← (`14099 min` é dado antigo de teste, não é bug)
- 4: Maria UI · 14099 min
- 6: Família UI · aniversário · 14099 min

**Atual**: Clicar no card/avatar da pessoa **não faz nada**.

**Esperado**:
- Clicar abre tela de detalhe/atendimento da pessoa na espera
- Tela já existe no canvas

**Ação**: Procurar no canvas a tela de "detalhe da pessoa na lista de espera" (provavelmente em `screens.jsx`, `screens-extra.jsx` ou `v5-host-tablemenu.png`).

**Critério de aceitação**:
- [ ] Card clicável → abre tela de atendimento da pessoa
- [ ] Layout bate com canvas

---

### 9. Reservas — cards não clicáveis

**Cenário**: Tela "Reservas · 2 AGUARDADAS · 1 CHEGARAM" mostra:
- EM ESPERA 20:30 · Família Silva · 5 pessoa(s)
- EM ESPERA 21:00 · Casal Aniversário · 2 pessoa(s) · romântico
- OK 22:00 · Reserva Teste R23 · 4 pessoa(s) · audit r23

**Atual**: Cards de reserva **não clicáveis**.

**Esperado**:
- Clicar abre tela de detalhe da reserva
- Tela já existe no canvas

**Ação**: Procurar tela de detalhe/edit de reserva no canvas.

**Critério de aceitação**:
- [ ] Card clicável → abre detalhe
- [ ] Layout bate com canvas

---

### 10. Bottom nav "Avisos" não responde

**Cenário**: Bottom nav do host: `Mesas / Espera / Reservas / Avisos / Eu`.

**Atual**: Clicar em "Avisos" → **nada acontece**.

**Esperado**: Navegar pra tela de avisos do host.

**Critério de aceitação**:
- [ ] Tab "Avisos" navega pra rota correta
- [ ] Tela de avisos do host existe e renderiza (mesmo que vazia inicialmente — empty state amigável)

---

### 11. "Aparência" — aplicação global do tema é placeholder

**Cenário**: Tela `/host/aparencia` deixa escolher Claro / Escuro / Automático.

**Atual**: Banner verde mostra **"Preferência salva. Aplicação global do tema chega no round 19."** — não aplica de verdade no app.

**Esperado**:
- Implementar de fato a troca de tema (claro/escuro/auto)
- Preferência salva por dispositivo
- Aplicar **em todo o app do host**

**Notas**: provavelmente quer ser feito junto com gerente (ver `05-gerente.md` bug 44 — Aparência) e cozinha (ver `04-cozinha.md` bug 25). Faz sentido fazer junto numa lib `@/lib/theme` compartilhada.

**Critério de aceitação**:
- [ ] Trocar pra Claro / Escuro / Automático aplica imediatamente
- [ ] Preferência persiste entre sessions
- [ ] Banner placeholder removido

---

### 12 + 20. Sino superior direito + erro "manager-only endpoint" vazando

**Cenário**: Recepcionista clica no sininho de notificações (topo direito da tela).

**Atual**:
- Abre a tela `/host/notifications`
- Mostra estado vazio "SEM NOTIFICAÇÕES. Tudo no ritmo. Quando algo precisar da sua atenção, vai cair aqui."
- **Mas tem um badge rosa de erro técnico: `manager-only endpoint`**
- Além disso, se você reparar nos ícones do bottom nav embaixo nessa tela, ela **literalmente abre a tela do GERENTE** (Painel / Operação / Equipe / Financeiro / Eu — esses são do gerente, não do host)

**Esperado**:
- Tela de notificações dedicada do **host** (não reusar a do gerente)
- Bottom nav permanece o do host (`Mesas / Espera / Reservas / Avisos / Eu`)
- Header da tela: simples back button + "Notificações"
- Endpoint correto pra host (não o `manager-only`)
- Sem erro técnico vazando — tratar e mostrar mensagem amigável

**Componente API**: ver `06-api-transversais.md` bug 20 — endpoint de notificações precisa ter variante por role (host, garçom, gerente) ou um único endpoint que respeita o `staffId` da sessão.

**Critério de aceitação**:
- [ ] Sininho do host abre `/host/notifications` (não tela do gerente)
- [ ] Bottom nav permanece do host
- [ ] Sem badge `manager-only endpoint`
- [ ] Empty state amigável se sem notificações

---

## Checklist final do chat

- Implementar fixes
- Adicionar testes E2E onde fizer sentido
- Audit visual: comparar com canvas antes de marcar como feito
- "Em desenvolvimento" toasts: ou implementar ou esconder o botão — não vazar pro usuário
- Erros técnicos (`manager-only endpoint` etc): tratar e ocultar
