# Round 18 · Sticky-Footer Audit

**Auditor**: Claude (Opus 4.7 · 1M context)
**Data**: 2026-05-10
**Cobertura**: 32 rotas (manager/host/waiter/cozinha) + 3 sheets · viewport mobile 393x852
**Screenshots**: `qa-reports/round18-sticky-shots/` (38 PNGs)

---

## 1. Resumo executivo

A audit cobriu telas onde existe (ou deveria existir) um CTA primário fixo no
rodapé, acima do bottom-nav. O servidor web-staff já roda no commit recente do
Round 18 ("Onda 2 sticky-fix") — várias telas (kitchen-reorder, compensate,
equipe lista, host-late-arrival, host-swap-empty) **JÁ estão corrigidas** com
o pattern `height: 100dvh + flex column + flex:1 overflow:auto + footer fora
do scroll`.

**Resultado**: das 32 rotas auditadas, identifiquei:

- **3 bugs P0** (CTA principal escondido sem scroll em condições reais)
- **3 bugs P1** (CTA fica off-screen quando vh shrinks ou content cresce —
  potencial pra bug em telas reais sem layout-shrink)
- **2 P2** (telas-menu onde "Sair do app" some no fim, mas é lista de rows não
  CTA primário)

### Top 3 críticos (P0)

1. **`/manager/equipe/[id]` (StaffDetail)** — "Editar funcionário" fica em
   y=1086 num viewport de 852px. Usuário PRECISA scrollar pra editar. Pattern:
   inner scroller `padding-bottom: 100px`, CTA dentro do scroll sem
   wrapper sticky. File: `ScreenManagerStaffDetail.tsx` (linha ~424)
2. **`/manager/equipe/[id]/editar` (Edit StaffForm)** — "Salvar alterações" +
   "Desativar funcionário" no fim do `flex: 1` container sem `overflow:auto`,
   então a página inteira overflowa. Bug emerge em viewports < 750px de
   altura ou com keyboard aberto. File: `ScreenManagerStaffForm.tsx`
   (linha 286 — `<div style={{ padding: 16, flex: 1 }}>`)
3. **`/manager/timeline/[orderId]` (TableTimeline)** — Ações "Avisar cozinha"
   + "Cortesia" em y=1081 no viewport 852. Off-screen total. Inner
   scroller existe mas CTAs ficam DENTRO do scroll, não fora. File:
   `ScreenManagerTableTimeline.tsx`

---

## 2. Tabela completa de rotas

| Tela | Rota | CTA(s) | Antes scroll | Depois scroll | Severity | Sticky? | File |
|---|---|---|---|---|---|---|---|
| Painel | `/manager` | Cozinha · Reordenar / Pausa (slim QuickActions) | OK (top) | n/a (inline) | OK | inline-top | `ScreenManagerHomeA.tsx:347` |
| Operação Alertas | `/manager/operacoes?tab=alerts` | AGIR AGORA bar | **VISÍVEL** | n/a | OK | flex-sibling | `ScreenManagerOps.tsx:226` |
| Operação Mapa | `/manager/operacoes?tab=map` | AGIR AGORA bar | **VISÍVEL** | n/a | OK | flex-sibling | idem |
| Operação Funil | `/manager/operacoes?tab=funnel` | AGIR AGORA bar | **VISÍVEL** | n/a | OK | flex-sibling | idem |
| Equipe Lista | `/manager/equipe` | "Adicionar funcionário" | **VISÍVEL** | **VISÍVEL** | OK | position:sticky | `ScreenManagerStaff.tsx` |
| Equipe Turnos | `/manager/equipe/turnos` | "Duplicar pra próxima semana" | **VISÍVEL** | **VISÍVEL** | OK | flex-sibling | `ScreenManagerShiftEditor.tsx` |
| **Equipe Novo** | `/manager/equipe/novo` | "Cadastrar e enviar acesso" | OK 852h, OFF-SCREEN 500h | scroll required | **P1** | NÃO | `ScreenManagerStaffForm.tsx:286,411` |
| **Equipe Detalhe** | `/manager/equipe/[id]` | "Editar funcionário" @y=1086 | **OFF-SCREEN** | required (scroll inside) | **P0** | NÃO | `ScreenManagerStaffDetail.tsx` |
| **Equipe Editar** | `/manager/equipe/[id]/editar` | "Salvar alterações" + "Desativar" | OK 852h, OFF-SCREEN 600h | required | **P0** | NÃO | `ScreenManagerStaffForm.tsx:286` |
| Cortesias Histórico | `/manager/cortesias` | (lista) | n/a | n/a | OK | - | - |
| Cortesias Nova | `/manager/cortesias?tab=new` | "Abrir compositor" | VISÍVEL 852h | required em < 750h | P1 | NÃO | `ScreenManagerCourtesies.tsx` |
| Compensate | `/manager/compensate` | "Mandar cortesia" | **VISÍVEL** | **VISÍVEL** | OK | position:sticky | `ScreenManagerCompensateClient.tsx` |
| Kitchen Reorder | `/manager/kitchen-reorder` | "Avisar cozinha · N pedidos" | **VISÍVEL** | **VISÍVEL** | OK | flex-sibling fora-do-scroll (já fixed Round 18 Onda 2) | `ScreenManagerKitchenReorder.tsx:106-110,403` |
| Configurações | `/manager/configuracoes` | (lista de rows) | parcial | n/a | P2 | NÃO (é lista, não CTA) | `ScreenManagerProfile.tsx` |
| Pausa Zona | `/manager/pausa-zona` | "Pausar por N min" (inline) | VISÍVEL (top) | n/a | OK | inline | `ScreenManagerOrdersPause.tsx` |
| Financeiro | `/manager/financeiro` | "Voltar ao Painel" | VISÍVEL | n/a | OK | - | - |
| Mensagens lista | `/manager/mensagens` | (sem CTA — empty state) | n/a | n/a | OK | - | - |
| Mensagens thread | `/manager/mensagens/[id]` | chat input + send | (Runtime error · skip) | - | n/a | - | bug separado em `ScreenStaffMessages.tsx:242` |
| Table Menu | `/manager/table-menu/[id]` | 6 ações em lista | parcial OK | "Fechar mesa" tocando edge | OK | inline list | `ScreenManagerTableMenu.tsx` |
| Mesa direta | `/manager/mesa/1` | "Voltar pro mapa" | VISÍVEL | n/a | OK | inline | - |
| **Timeline** | `/manager/timeline/[id]` | "Avisar cozinha", "Cortesia" @y=1081 | **OFF-SCREEN** | required | **P0** | NÃO | `ScreenManagerTableTimeline.tsx` |
| Alertas all | `/manager/alertas` | (cards inline, sem CTA primário) | OK | n/a | OK | - | `ScreenManagerAlertsAll.tsx` |
| Chamado detalhe | `/manager/chamado/[id]` | "Voltar" + "A caminho" | VISÍVEL (visto via redirect) | - | OK | flex-sibling | - |
| Stat detalhe | `/manager/stat/[kind]/[id]` | - | - | - | OK | - | `ScreenManagerStatDetail.tsx` |
| Host Home | `/host` | (sem CTA primário no empty state) | n/a | n/a | OK | - | - |
| Host Waitlist | `/host/waitlist` | "+" top-right + sheet | OK | n/a | OK | top button | - |
| Host Reservations | `/host/reservations` | "+" + sheet | OK | n/a | OK | top button | - |
| Host Late Arrival | `/host/late-arrival/[id]` | "Rejeitar" + "Aprovar entrada" | **VISÍVEL** | n/a | OK | flex-sibling | - |
| Host Swap | `/host/swap` | "Confirmar troca" | **VISÍVEL** (empty state) | risk se overflow | P2 | NÃO mas fica no fim do flex column | - |
| Host Liberate | `/host/liberate/[tableId]` | (não testado — fora do escopo confirmado) | - | - | - | - | - |
| Host Profile | `/host/profile` | "Sair do app" @y=683 | VISÍVEL borderline | risk | P2 | NÃO (é menu) | - |
| Host Mensagens | `/host/mensagens` | (não testado por tempo) | - | - | - | - | - |
| Waiter Home | `/waiter` | FAB scan-qr | **VISÍVEL** | n/a | OK | position:fixed | - |
| Waiter Eu | `/waiter/eu` | "Encerrar turno", "Sair da conta" @y=871, 932 | **OFF-SCREEN** (menu rows) | required | P2 | NÃO (é lista de rows) | - |
| Waiter QR Issue | `/waiter/qr-issue` | "Reportar pra gerente" + "Cancelar" | **VISÍVEL** | n/a | OK | sticky parent | - |
| Waiter Scan QR | `/waiter/scan-qr` | (não testado por tempo) | - | - | - | - | - |
| Cozinha KDS | `/cozinha` | (sem footer · ação inline em cards) | OK | n/a | OK | - | - |

---

## 3. Bugs detalhados

### P0 — telas críticas, CTA principal escondido

#### P0.1 — `/manager/equipe/[id]` (StaffDetail)
- **Sintoma**: "Editar funcionário" não aparece sem scroll. Usuário abre a
  página, vê tabs "Hoje/7d/30d" + 4 cards de métricas + gráfico + comparativo
  e só DEPOIS encontra o CTA "Editar funcionário". É o CTA principal da tela.
- **Repro**: vh=852, abre `/manager/equipe/8bd06156-1fe5-4c18-a82d-43d38287ed4a`
  → CTA fica em y=1086 (off-screen).
- **Screenshots**: `09a-staff-detail-top.png` (CTA invisível), `10b-staff-detail-scrolled.png` (CTA aparece após scroll).
- **Severidade**: P0 — afeta fluxo de gestão de equipe (manager edita
  funcionários frequentemente).
- **Arquivo**: `apps/web-staff/src/screens/manager/ScreenManagerStaffDetail.tsx`

#### P0.2 — `/manager/equipe/[id]/editar` (StaffForm edit mode)
- **Sintoma**: Form de edição com vários campos + role-picker + ações ao
  final. CTAs "Salvar alterações" e "Desativar funcionário" ficam no fim
  do `<div style={{ padding: 16, flex: 1 }}>` (linha 286) — esse div não
  tem `overflow: auto` nem `min-height: 0`, então a página inteira cresce
  e o body scrolla. CTAs em y=703, 758 (visível só por sorte com vh=852).
- **Repro**: shrink vh para 600px (simulando keyboard aberto) → CTAs em
  y=703, 758 ambos OFF-SCREEN. docH=824 > vh=600. Usuário precisa scrollar
  pelo body inteiro.
- **Screenshots**: `11-staff-editar-600h.png` (CTA totalmente off-screen).
- **Severidade**: P0 — em mobile real com teclado virtual aberto, vh fica em
  ~500-600px, garantindo que o save fica off-screen. Bug em produção real.
- **Arquivo**: `apps/web-staff/src/screens/manager/ScreenManagerStaffForm.tsx:286`

#### P0.3 — `/manager/timeline/[orderId]` (TableTimeline)
- **Sintoma**: Página de timeline da mesa tem inner scroller com
  `padding-bottom: 100px`. Os botões de ação ("Avisar cozinha", "Cortesia")
  ficam ao final do scroll, dentro do scroller, NÃO como sticky fora.
- **Repro**: vh=852, abre `/manager/timeline/order-1` → botões em y=1081
  (off-screen). Inner scroller content=1197, viewport=717.
- **Screenshots**: `28-timeline.png`.
- **Severidade**: P0 — Timeline é abertura de troubleshoot rápida pelo
  manager (cliente esperando) e precisa do CTA acessível imediato.
- **Arquivo**: `apps/web-staff/src/screens/manager/ScreenManagerTableTimeline.tsx`

### P1 — Risk em viewport real

#### P1.1 — `/manager/equipe/novo` (StaffForm create mode)
- Mesma estrutura do P0.2 (linha 286 `padding: 16, flex: 1` sem overflow).
- Em vh=500 (teclado aberto em iPhone SE) → CTA "Cadastrar e enviar acesso"
  off-screen, docH=773, vh=500.
- Screenshot: `08b-equipe-novo-500h.png`.

#### P1.2 — `/manager/cortesias?tab=new`
- "Abrir compositor" em y=709, stickyAnc=false.
- Em vh=852 cabe; em vh<700 vai ficar abaixo.

#### P1.3 — `/host/swap` (com conteúdo · não-empty)
- Pattern semelhante: "Confirmar troca" fica no fim do flex column.
- Atual empty state mostra sem problema mas se houver várias mesas
  candidates, o CTA pode cair off-screen.

### P2 — Telas-menu (lista de rows, não CTA primário)

#### P2.1 — `/manager/configuracoes`
- "Sair do app" em y=912 (off-screen). Lista de 9 rows.
- Aceitável pra design de "lista de configs", mas P2 vale anotar.

#### P2.2 — `/host/profile`
- "Sair do app" em y=683 borderline. Mesmo pattern.

#### P2.3 — `/waiter/eu`
- "Encerrar turno" + "Sair da conta" em y=871, 932 — off-screen.
- Lista de configurações de waiter (Mensagens, Notificações, Preferências,
  Equipe e turno).

---

## 4. Pattern fix recomendado

O canônico do Round 18 (já aplicado em kitchen-reorder, compensate, equipe):

```tsx
// OUTER: height fixed (NÃO minHeight) + flex column
<div style={{
  height: '100dvh',              // NÃO use minHeight: '100dvh'
  display: 'flex',
  flexDirection: 'column',
  background: C.surface,
}}>
  <MTopBar … />

  {/* MIDDLE: rolável, paddingBottom pra dar espaço pro footer */}
  <div style={{
    flex: 1,
    overflow: 'auto',
    minHeight: 0,                 // crucial pra flex-1 + scroll funcionar
    paddingBottom: 24,            // ou maior se o footer for grande
  }}>
    {/* … conteúdo do form / cards / timeline … */}
  </div>

  {/* FOOTER: fora do scroll, sticky no bottom da viewport */}
  <div style={{
    padding: '12px 16px 18px',
    background: C.bg,
    borderTop: `1px solid ${C.borderSoft}`,
    flexShrink: 0,                // não comprime
  }}>
    <GButton dark={dark} full kind="primary" onClick={onSave}>
      Salvar alterações
    </GButton>
  </div>

  {/* Bottom-nav (quando aplicável) */}
  <MBottomNav … />
</div>
```

**Chaves**:
1. Outer `height: '100dvh'` (não `minHeight`) — sem isso o outer cresce com
   o conteúdo e o footer vai pro fim do body scroll.
2. Inner `flex: 1, overflow: 'auto', minHeight: 0` — `minHeight: 0` é
   obrigatório quando há nested flex columns, senão o flex-1 não constrange
   sua altura.
3. Footer como flex sibling do scroller, `flexShrink: 0`.

**Anti-pattern atualmente em ScreenManagerStaffForm.tsx**:
```tsx
// ❌ Errado: o div com flex:1 não tem overflow auto, então
// quando o form cresce, a página inteira overflowa.
<div style={{ padding: 16, flex: 1 }}>
  {/* campos do form */}
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 18 }}>
    <GButton …>{isEdit ? 'Salvar alterações' : 'Cadastrar e enviar acesso'}</GButton>
    {isEdit && <GButton kind="ghost" onClick={onDeactivate}>Desativar funcionário</GButton>}
  </div>
</div>
```

**Fix sugerido para StaffForm**:
```tsx
<div style={{ padding: 16, flex: 1, overflow: 'auto', minHeight: 0 }}>
  {/* só os campos */}
</div>
<div style={{
  padding: '12px 16px 18px',
  background: C.bg,
  borderTop: `1px solid ${C.borderSoft}`,
  display: 'flex', flexDirection: 'column', gap: 8,
  flexShrink: 0,
}}>
  <GButton …>{isEdit ? 'Salvar alterações' : 'Cadastrar e enviar acesso'}</GButton>
  {isEdit && <GButton kind="ghost" onClick={onDeactivate}>Desativar funcionário</GButton>}
</div>
```

---

## 5. Sheets (bottom-sheets) — auditoria separada

| Sheet | Trigger | CTA principal | Sticky? | Observação |
|---|---|---|---|---|
| Host Waitlist Add | `/host/waitlist` → "+" | "Cancelar" + "Adicionar à fila" | OK | Screenshot `18-host-waitlist-sheet.png` |
| Host Reservations Add | `/host/reservations` → "+" | "Cancelar" + "Salvar reserva" | OK | Screenshot `19-host-reservations-sheet.png` |
| QR Issue (na rota inteira) | `/waiter/qr-issue` | "Reportar pra gerente" + "Cancelar" | OK | sticky parent confirmado |
| MContactStaffSheet | Equipe → "Mensagem direta" | (não pesquisei por tempo) | - | - |
| MContactClientSheet | TableMenu → "Contactar cliente" | (não pesquisei por tempo) | - | - |
| ShiftEditor MoreSheet + AddSheet | Equipe/Turnos | (não testei por tempo) | - | - |
| TableMenu MoreSheet | TableMenu → "..." | (não testei por tempo) | - | - |

Sheets testadas (waitlist, reservations, qr-issue): todas com CTA sticky no
bottom da sheet. Pattern de sheet (`Sheet` library) parece já fazer o sticky
correto. Pendente: validar MContactStaffSheet + MContactClientSheet +
ShiftEditor sheets pra cobrir 100%.

---

## 6. Falsos alarmes do user report inicial

O super-prompt indicou casos confirmados:
- `/manager/operacoes` — **NÃO REPRODUZ HOJE**: AGIR AGORA bar está sticky em
  todas as 3 tabs (alerts/map/funnel). Pode ter sido um build anterior.
- `/manager/kitchen-reorder` — **NÃO REPRODUZ HOJE**: "Avisar cozinha · N
  pedidos" está sticky (comment no código menciona "Round 18 Onda 2 sticky-fix").
- `/manager/operacoes?tab=map` — bar visível, não está espremido na minha
  audit. Ver `26-ops-map.png`.

Esses parecem ter sido fixados no commit recente da Onda 2 (`height: 100vh`
trocado por `100dvh` + flex-column-sibling pattern). 3 telas restantes
(StaffDetail, StaffForm, TableTimeline) escaparam dessa Onda 2 e continuam
broken.

---

## 7. Próximos passos sugeridos (fora do escopo desta audit · só pra
backlog)

1. Aplicar o Round-18-Onda-2 pattern em:
   - `ScreenManagerStaffDetail.tsx` (P0.1)
   - `ScreenManagerStaffForm.tsx` (P0.2 + P1.1)
   - `ScreenManagerTableTimeline.tsx` (P0.3)
   - `ScreenManagerCourtesies.tsx` (P1.2)
2. Fix runtime error em `ScreenStaffMessages.tsx:242` (TypeError reading
   'length' of undefined) — descoberto incidentalmente.
3. Considerar refatorar o pattern num primitivo `<StickyFooterShell>` em
   `components/manager/` pra padronizar.
4. Testar as sheets pendentes (MContactStaffSheet, MContactClientSheet,
   ShiftEditor sheets).

---

**Contagem final**: **P0 = 3** · **P1 = 3** · **P2 = 3**.

**Screenshots**: 38 PNGs em `qa-reports/round18-sticky-shots/`.
