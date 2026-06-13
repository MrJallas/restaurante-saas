# TV — Cozinha & Bar

Telas de monitoramento (Kitchen Display System) para serem exibidas em TVs na cozinha e no bar do restaurante. Recebem em tempo real os pedidos feitos pelo cliente via app/QR Code.

## Arquivos

- `tv-cozinha-bar.html` — entrypoint standalone (abre as duas TVs empilhadas para revisão)
- `tv-screens.jsx` — componentes `TV_KitchenKDS` e `TV_BarBoard` + mocks
- `README.md` — este documento

## Resoluções

- Cada TV foi desenhada para **1920×1080** (Full HD)
- Header fixo de **88px**
- Cozinha: grid **4 colunas** (até 4 pedidos visíveis lado a lado por linha)
- Bar: grid **3 colunas** (drinks têm menos itens por pedido, cabe mais em altura)

---

## Modelo de dados

```ts
type OrderStatus = 'novo' | 'preparando' | 'atrasado' | 'pronto';

type KitchenItem = {
  q: number; // quantidade
  n: string; // nome do prato
  note: string | null; // observação livre digitada pelo cliente
  alert?: boolean; // se true → observação destacada em vermelho (alergia, restrição grave)
  station: 'entradas' | 'massas' | 'grelha' | 'sobremesas';
};

type BarItem = { q: number; n: string; note: string | null };

type Order = {
  id: string; // ex: '#0142' — identificador curto, fácil de gritar
  table: string; // ex: 'Mesa 12' ou 'Balcão 02'
  when: string; // 'HH:MM' de quando foi recebido
  elapsedMin: number; // minutos decorridos desde o recebimento (calcular no cliente)
  status: OrderStatus;
  items: KitchenItem[] | BarItem[];
};
```

### Como o `status` evolui (máquina de estados)

```
novo  ──▶  preparando  ──▶  pronto  ──▶  (entregue/arquivado)
            │
            └──▶  atrasado  (automático quando elapsedMin > THRESHOLD)
```

- `novo` — acabou de chegar, ninguém abriu ainda. Botão principal: **Iniciar preparo**
- `preparando` — alguém apertou "Iniciar preparo". Botão principal: **Marcar pronto**
- `atrasado` — derivado: qualquer pedido `preparando` com `elapsedMin > 12` (configurável). O card pulsa em vermelho. Botão principal continua sendo **Marcar pronto**
- `pronto` — pratos prontos no balcão para o garçom levar. Botão principal: **Servir agora** (cozinha) ou **Entregar** (bar)

> Sugestão: `atrasado` deve ser **derivado**, não persistido. O backend manda só `novo | preparando | pronto` e o front calcula `atrasado` baseado em `elapsedMin`. Assim, se a equipe corre e fecha um pedido atrasado, o status volta sozinho ao normal sem precisar de update separado.

### Recalcular `elapsedMin` no cliente

```js
// Atualizar a cada 30s
const elapsedMin = Math.floor((Date.now() - new Date(order.receivedAt)) / 60000);
const isLate = order.status === 'preparando' && elapsedMin > 12;
```

---

## Botões e ações — explicação

### Botão principal (footer do card)

O texto e a ação **mudam conforme o status**:

| Status                    | Texto                 | Ação esperada (PATCH /orders/:id)                                 |
| ------------------------- | --------------------- | ----------------------------------------------------------------- |
| `novo`                    | ▶ **Iniciar preparo** | `{ status: 'preparando', startedBy: <userId>, startedAt: <now> }` |
| `preparando` / `atrasado` | **Marcar pronto**     | `{ status: 'pronto', readyAt: <now> }`                            |
| `pronto` (cozinha)        | ✓ **Servir agora**    | `{ status: 'servido', servedAt: <now> }` → some do KDS            |
| `pronto` (bar)            | ✓ **Entregar**        | idem                                                              |

### Botão `⋯` (três pontos) — menu de ações secundárias

Hoje é um placeholder visual. Quando implementado, deve abrir um popover com:

1. **Chamar garçom para a mesa** — útil quando o pedido está pronto e não tem garçom por perto. Dispara notificação para o app do garçom + para a tela do salão.
2. **Voltar status anterior** — corrigir clique errado (ver seção [Correção de erros](#correção-de-erros) abaixo). Reverte para o status imediatamente anterior.
3. **Marcar item específico como pronto** — em pedidos com vários pratos, permite ir liberando item por item (útil para entrada antes do principal).
4. **Adicionar nota interna** — comunicação entre cozinheiros ("falta camarão, usar lula"). Aparece em cinza, distinta da observação do cliente.
5. **Pausar pedido** — congela o `elapsedMin`. Ex: cliente pediu para esperar a chegada de mais alguém.
6. **Imprimir comanda** — fallback se a impressora térmica falhou.
7. **Cancelar pedido** — requer confirmação dupla + motivo. Notifica o cliente.

### Contadores no header (chips clicáveis)

- **Todos** — mostra todos os pedidos
- **Novos / Em preparo / Atrasados / Prontos** — filtram o grid pelo status correspondente
- O contador "Atrasados" pulsa em vermelho quando > 0
- Estado ativo: chip com fundo branco
- Quando filtrado, o título do header pode mudar para "Mostrando 3 atrasados" para reforçar contexto

---

## Correção de erros

Cliques errados são frequentes em ambiente de cozinha (mãos molhadas, pressa, tela suja). O sistema **deve permitir reversão**, mas com guarda-rails para evitar abuso.

### Estratégia: undo de 5 segundos + histórico

1. Quando o cozinheiro clica em **Iniciar preparo** / **Marcar pronto** / **Servir agora**, a transição acontece imediatamente, mas:
   - Aparece um **toast/snackbar** no canto inferior: _"Pedido #0142 iniciado · **Desfazer** (5s)"_
   - Durante 5 segundos, clicar em "Desfazer" reverte o status sem registrar penalidade
   - Após 5s, o snackbar some e o evento é "consolidado"

2. Após a janela de undo, ainda é possível reverter via `⋯ → Voltar status anterior`, mas:
   - Pede confirmação ("Tem certeza? Esta ação será registrada.")
   - Loga `correctedBy: <userId>` e `correctionReason: <opcional>`
   - Aparece um pequeno indicador no card (`⟲ corrigido`) que some quando o pedido é finalizado

### Regras de transição reversa

| De           | Pode voltar para  | Observação                                                       |
| ------------ | ----------------- | ---------------------------------------------------------------- |
| `preparando` | `novo`            | Reverte `startedAt` e `startedBy`                                |
| `pronto`     | `preparando`      | Reverte `readyAt`. Comum: cozinheiro percebeu que faltou um item |
| `servido`    | `pronto`          | Pedido reaparece no KDS. Garçom errou de mesa                    |
| `cancelado`  | (estado anterior) | Apenas gerente pode reverter cancelamento                        |

### O que **não** deve ser revertível

- Pagamento já processado
- Pedidos com mais de 30 min finalizados (já saíram do KDS, viraram histórico)

### Multi-usuário

Mais de uma pessoa pode estar mexendo na mesma TV (ou em TVs diferentes da mesma cozinha). Use **optimistic locking** ou **last-write-wins** com um pequeno banner se outro usuário alterou o pedido nos últimos 2s: _"Rodrigo iniciou este pedido há 1s"_.

---

## Realtime — como conectar ao backend

```js
// 1. WebSocket / SSE recebe pedidos novos e updates de status
const ws = new WebSocket('wss://api.restaurante.com/kds/kitchen');
ws.onmessage = (e) => {
  const event = JSON.parse(e.data);
  // event.type: 'order_created' | 'order_updated' | 'order_removed'
  // event.order: Order
};

// 2. Tick local de 30s para recalcular elapsedMin e status derivado 'atrasado'
setInterval(() => forceRerender(), 30000);

// 3. Ações do usuário fazem PATCH otimista + emitem via WebSocket
async function updateOrderStatus(orderId, newStatus) {
  // optimistic update local
  setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)));
  // envia ao backend
  try {
    await fetch(`/api/orders/${orderId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus, by: currentUser.id }),
    });
  } catch (e) {
    // rollback se falhou
    revertOptimistic(orderId);
    showToast('Erro ao atualizar. Tente novamente.');
  }
}
```

### Eventos sugeridos do backend

```
order_created    — novo pedido entrou (cliente confirmou no app)
order_updated    — status mudou (qualquer KDS pode emitir)
order_item_ready — item específico ficou pronto (libera entradas antes do principal)
order_removed    — pedido cancelado/servido — sai do grid
order_paused     — congelar contador
```

---

## Comportamentos extras sugeridos

### Som + flash

- **Pedido novo** entrou: bipe curto + flash branco no card por 500ms
- **Pedido vira atrasado**: alarme sutil (bipe duplo) — não tocar repetidamente, só uma vez por transição
- **Pedido pronto há mais de 5min sem ser servido**: alarme — está esfriando

Volume e ativação devem ser configuráveis (cozinha barulhenta vs. bar mais silencioso).

### Auto-arquivar

- Pedidos `servido` somem do KDS após 10s (animação fade-out)
- Histórico fica disponível em `/kds/history` (tela separada, não documentada aqui)

### Filtro por estação (cozinha)

Acima do grid, adicionar chips de estação (`Todas · Massas · Grelha · Entradas · Sobremesas`). Útil quando há mais de uma TV na cozinha — uma para cada estação.

### Modo noturno

Inverter para fundo escuro (`#0a0a0a`) e cards com bordas claras. Útil em ambientes com pouca luz onde o branco brilha demais.

### Drag-and-drop para reordenar prioridade

Permitir que o gerente arraste cards para reordenar — útil quando uma mesa VIP precisa ser priorizada.

---

## Design tokens (referência)

```js
const C = {
  ink:        '#0a0a0a',  // texto / bordas
  borderSoft: '#e5e5e5',  // separadores internos
  mute:       '#6b6b6b',  // texto secundário
  faint:      '#a3a3a3',  // texto terciário
  surface:    '#f6f5f2',  // fundo da área de pedidos
  danger:     '#c43a3a',  // atrasado / alergia
  success:    '#2f7d4f',  // pronto
};

// Status → cor
novo        → ink (#0a0a0a)
preparando  → âmbar (#f0c542)
atrasado    → danger (#c43a3a) + animação pulse
pronto      → success (#2f7d4f)

// Observação do cliente (note)
normal      → bg #fff7d6, border #e8c84a, text #5a4500
alert=true  → bg danger, text branco (alergia, restrição médica)
```

Tipografia: **Inter** (400/500/600/700). Tamanhos otimizados para leitura a ~3m de distância (TV de cozinha).
