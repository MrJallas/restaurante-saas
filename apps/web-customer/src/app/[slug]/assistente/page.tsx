'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { apiPost, apiGet } from '../../../lib/api';
import { getSessionToken } from '../../../lib/storage';
import { useSession } from '../../../hooks/useSession';
import { useNav } from '../../../hooks/useNav';
import { useDraftOrder } from '../../../providers/DraftOrderProvider';
import { AppShell } from '../../../components/layout/AppShell';
import { Bubble } from '../../../components/ui/Bubble';
import { SoftInput } from '../../../components/ui/SoftInput';

interface LinkedItem {
  id: string;
  name: string;
  priceCents: number;
  imageUrl: string | null;
  categoryName?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'ai' | 'blocked';
  content: string;
  linkedItems?: LinkedItem[];
  /** menuItemIds the user chose from this message's cards */
  selectedIds?: string[];
  /** true once the user confirmed the selection from this bubble */
  orderPlaced?: boolean;
}

interface SendResponse {
  response: string;
  wasBlocked: boolean;
  blockReason?: string;
  suggestions?: string[];
  linkedItems?: LinkedItem[];
}

const DEFAULT_SUGGESTIONS = [
  'Sugestão leve',
  'Sobremesa combina?',
  'Pratos com camarão',
  'Como pagar?',
];

// Palavras que, combinadas com itens ja mencionados pela IA, indicam "quero
// pedir". Tem que ter VERBO de pedido — "tudo bem"/"tudo certo" virava falso
// positivo (P0 do bug-hunt: usuario respondia saudacao e o app criava
// pedido fake de R$ 78,90 sem confirmacao). "tudo"/"todos"/"ambos" sozinhos
// nao bastam mais — precisam vir junto com verbo de acao.
const ORDER_INTENT_PATTERNS = [
  /\bquero (os |as |o |a |esse|essa|esses|essas|tudo|todos|todas|ambos|ambas|esses|essas|ele|ela|eles|elas)/,
  /\b(pode|podes|poderia) (pedir|mandar|trazer|pegar)\b/,
  /\b(pede|peca|pede la|pede ai|manda|mandar|traz|traga)\b/,
  /\bvou querer\b/,
  /\bvou levar\b/,
  /\bpede pra mim\b/,
  /\bme (traz|ve|vê|da)\b/,
  /\bpedir (os|as|o|a|esse|essa|todos|tudo|ambos)\b/,
  /\bconfirma(r)? (o |os |a |as )?pedido\b/,
  /\bisso mesmo,? (pode |peca|manda|pede)/,
  /\bpode ser,? (manda|pede|pode pedir)/,
  /\b(os|as) (dois|duas|2),? (manda|pede|pode pedir|por favor)/,
];

// "tudo bem"/"tudo certo"/"tudo otimo" sao saudacoes — NAO pedido. Bloqueia
// match espurio quando o usuario acabou de receber linkedItems e responde
// "tudo bem" pra um cumprimento da IA.
const NON_ORDER_TUDO_PATTERNS =
  /\btudo (bem|certo|joia|otimo|ok|legal|tranquilo|certinho|beleza|firmeza)\b/;

// "todos os/as" especifico = pedido; "todos" sozinho ambiguo, exigimos
// contexto de verbo (coberto em ORDER_INTENT_PATTERNS acima).
const ALL_ITEMS_KEYWORDS =
  /\b(os dois|as duas|os 2|ambos|ambas|os tres|as tres|os 3|todos os|todas as)\b/;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function detectOrderIntent(
  message: string,
  previousLinkedItems: LinkedItem[] | undefined,
): LinkedItem[] | null {
  if (!previousLinkedItems || previousLinkedItems.length === 0) return null;
  const msg = normalize(message);

  // Curto-circuito: saudacao com "tudo bem/certo/etc" nao e pedido.
  // Sem esse guard, "tudo bem" disparava placeOrderForItems(linkedItems
  // do turno anterior), criando pedido fake e navegando pra /pix.
  if (NON_ORDER_TUDO_PATTERNS.test(msg)) return null;

  const hasIntent = ORDER_INTENT_PATTERNS.some((re) => re.test(msg));
  if (!hasIntent) return null;

  // "os dois"/"todos"/"tudo"/"ambos" → todos os itens sugeridos
  if (ALL_ITEMS_KEYWORDS.test(msg)) {
    return previousLinkedItems;
  }

  // Se o usuario mencionou nomes especificos → filtra
  const picked = previousLinkedItems.filter((it) =>
    msg.includes(normalize(it.name)),
  );
  if (picked.length > 0) return picked;

  // "quero pedir" sem especificar e um so item na lista → pega esse
  if (previousLinkedItems.length === 1) return previousLinkedItems;

  // Varios itens, nenhum nome mencionado: interpretamos como "todos"
  return previousLinkedItems;
}

export default function AssistentePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const session = useSession();
  const { push } = useNav();
  const { addItem } = useDraftOrder();
  const router = useRouter();
  const slug = params.slug as string;
  const prefill = searchParams.get('prefill') ?? '';
  const itemId = searchParams.get('itemId') ?? '';

  useEffect(() => {
    if (!getSessionToken()) {
      router.replace(`/${slug}`);
    }
  }, [slug, router]);

  // Se chegou via prefill (usuario ja digitou algo na home), arrancamos com o
  // bubble do usuario ja visivel + loading — sem exibir o greeting "Olá" —
  // porque do ponto de vista do cliente ele apenas enviou a pergunta.
  const initialMessages = useMemo<ChatMessage[]>(() => {
    if (prefill) {
      return [{ id: 'prefill-user', role: 'user', content: prefill }];
    }
    return [];
  }, [prefill]);

  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(!!prefill);
  const [suggestions, setSuggestions] = useState<string[]>(DEFAULT_SUGGESTIONS);
  const [chipBusy, setChipBusy] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const autoSentRef = useRef(false);

  useEffect(() => {
    // Quando ha prefill, o usuario acabou de digitar na home; nao sobrescrever
    // o bubble inicial com historico — o envio do prefill ja vai anexar a
    // resposta da IA abaixo dele.
    if (!slug || prefill) return;
    const load = async () => {
      try {
        // Passa customerId pra que o backend filtre por proprio cliente —
        // sem isso, cliente B na mesma mesa via TODA a conversa do
        // cliente A (LGPD/privacidade).
        const url = session.customerId
          ? `/${slug}/assistant/history?customerId=${session.customerId}`
          : `/${slug}/assistant/history`;
        const res = await apiGet<{ messages: { role: string; content: string }[] }>(
          url,
        );
        if (res.messages.length > 0) {
          setMessages(
            res.messages.map((m, i) => ({
              id: `history-${i}`,
              role: m.role === 'user' ? 'user' : 'ai',
              content: m.content,
            })),
          );
        }
      } catch {
        /* ignore */
      }
    };
    load();
  }, [slug, prefill]);

  useEffect(() => {
    // Nas primeiras mensagens o "smooth" faz o chat animar de baixo pra cima
    // no primeiro paint — em iPhone real isso sai lag-ado. Acima do threshold
    // o comportamento normal volta.
    messagesEndRef.current?.scrollIntoView({
      behavior: messages.length > 3 ? 'smooth' : 'auto',
    });
  }, [messages, loading]);

  const [placingOrder, setPlacingOrder] = useState(false);

  /**
   * Core order placement: adiciona itens ao draft, cria o pedido e leva pro
   * countdown de 15s. Usado tanto pelo botao "Sim, pedir" quanto pelo fluxo
   * por chat ("quero os dois").
   */
  const placeOrderForItems = async (picked: LinkedItem[], sourceMessageId: string) => {
    if (placingOrder || picked.length === 0) return;
    setPlacingOrder(true);

    const mode: 'individual' | 'table' = session.customerId ? 'individual' : 'table';
    picked.forEach((it) => {
      addItem({
        menuItemId: it.id,
        name: it.name,
        priceCents: it.priceCents,
        quantity: 1,
        commandMode: mode,
      });
    });

    try {
      const res = await apiPost<{ id: string }>(`/${slug}/orders`, {
        billingMode: mode,
        visitId: session.visitId || undefined,
        customerId: session.customerId || undefined,
        items: picked.map((it) => ({ menuItemId: it.id, quantity: 1 })),
      });
      setMessages((prev) =>
        prev.map((m) => (m.id === sourceMessageId ? { ...m, orderPlaced: true } : m)),
      );
      push(`/${slug}/pedido/confirmando?orderId=${res.id}`);
    } catch {
      setPlacingOrder(false);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'ai',
          content: 'Não consegui enviar seu pedido agora. Tente de novo em instantes.',
        },
      ]);
    }
  };

  const sendMessage = async (text: string, options?: { skipUserBubble?: boolean }) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (!options?.skipUserBubble) {
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: trimmed,
      };
      setMessages((prev) => [...prev, userMsg]);
    }
    setInput('');

    // Se a IA acabou de sugerir pratos e o usuario respondeu com intencao de
    // pedido ("quero os dois", "pode mandar"), pulamos o round-trip pela IA
    // e ja iniciamos o pedido direto — os 15s do /confirmando funcionam como
    // janela de cancelamento.
    const lastAiWithItems = [...messages]
      .reverse()
      .find(
        (m) =>
          m.role === 'ai' &&
          !!m.linkedItems &&
          m.linkedItems.length > 0 &&
          !m.orderPlaced,
      );
    if (lastAiWithItems?.linkedItems) {
      const picked = detectOrderIntent(trimmed, lastAiWithItems.linkedItems);
      if (picked && picked.length > 0) {
        const names = picked
          .map((p, i, arr) =>
            i === 0
              ? p.name
              : i === arr.length - 1
                ? ` e ${p.name}`
                : `, ${p.name}`,
          )
          .join('');
        setMessages((prev) => [
          ...prev,
          {
            id: `ai-${Date.now()}`,
            role: 'ai',
            content: `Perfeito! Já estou pedindo ${names} para você.`,
          },
        ]);
        await placeOrderForItems(picked, lastAiWithItems.id);
        return;
      }
    }

    setLoading(true);

    try {
      const res = await apiPost<SendResponse>(`/${slug}/assistant/message`, {
        message: trimmed,
        customerId: session.customerId || undefined,
        itemId: itemId || undefined,
      });

      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: res.wasBlocked ? 'blocked' : 'ai',
        content: res.response,
        linkedItems: res.linkedItems && res.linkedItems.length > 0 ? res.linkedItems : undefined,
        selectedIds: [],
      };
      setMessages((prev) => [...prev, aiMsg]);

      if (res.suggestions && res.suggestions.length > 0) {
        setSuggestions(res.suggestions);
      }
    } catch (err) {
      // Distingue erros de validacao (mensagem muito longa, formato
      // invalido) do erro generico de rede pra que o usuario saiba se
      // pode editar e tentar de novo. Backend valida @MaxLength(2000).
      const isTimeout =
        err instanceof Error && err.message === 'TIMEOUT';
      const isValidationError =
        err instanceof Error && /400/.test(err.message);
      const isLengthError =
        err instanceof Error && /shorter than|2000 characters/i.test(err.message);
      const content = isTimeout
        ? 'Conexão lenta. Tente novamente.'
        : isLengthError
          ? 'Mensagem muito longa. Por favor, encurte para no máximo 2000 caracteres.'
          : isValidationError
            ? 'Não consegui processar essa mensagem. Tente reformular.'
            : 'Desculpe, estou com dificuldade no momento. Tente novamente.';
      const errorMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'ai',
        content,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  // Keep the latest `sendMessage` accessible from the prefill effect without
  // putting it in the dep array (it's a new reference on every render, which
  // would cancel the 300ms timeout repeatedly and lose the auto-send).
  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;

  useEffect(() => {
    if (!prefill || autoSentRef.current) return;
    autoSentRef.current = true;
    // Bubble do usuario ja foi renderizada via initialMessages; aqui so
    // disparamos a chamada da IA. Sem timeout: queremos o typing indicator
    // aparecer no mesmo frame que o usuario chega na tela.
    sendMessageRef.current(prefill, { skipUserBubble: true });
  }, [prefill]);

  const toggleLinkedSelection = (messageId: string, itemId: string) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId || m.orderPlaced) return m;
        const current = m.selectedIds ?? [];
        const next = current.includes(itemId)
          ? current.filter((x) => x !== itemId)
          : [...current, itemId];
        return { ...m, selectedIds: next };
      }),
    );
  };

  const confirmLinkedOrder = async (messageId: string) => {
    if (placingOrder) return;
    const msg = messages.find((m) => m.id === messageId);
    if (!msg || !msg.linkedItems || !msg.selectedIds || msg.selectedIds.length === 0) return;

    const picked = msg.linkedItems.filter((it) => msg.selectedIds!.includes(it.id));
    await placeOrderForItems(picked, messageId);
  };

  return (
    <AppShell
      slug={slug}
      restaurantName=""
      tableLabel={session.tableLabel || ''}
      activeHref={`/${slug}/assistente`}
      noMainPadding
    >
      <div className="flex flex-1 flex-col">
        <div className="gpu-layer flex flex-1 flex-col gap-3.5 overflow-auto px-[22px] pb-4 pt-3">
          {messages.map((msg) => {
            const selected = msg.selectedIds ?? [];
            const hasCards = !!msg.linkedItems && msg.linkedItems.length > 0;
            const showConfirm = hasCards && selected.length > 0 && !msg.orderPlaced;
            return (
              <div key={msg.id} className="flex flex-col gap-2">
                <Bubble role={msg.role}>{msg.content}</Bubble>
                {hasCards && (
                  <div className="-mx-[22px] flex gap-2.5 overflow-x-auto px-[22px] pb-1 [&::-webkit-scrollbar]:hidden">
                    {msg.linkedItems!.map((it) => {
                      const isSel = selected.includes(it.id);
                      return (
                        <div
                          key={it.id}
                          className={`flex w-[148px] shrink-0 flex-col overflow-hidden rounded-[16px] border-[1.3px] bg-bg transition-colors ${
                            isSel ? 'border-ink' : 'border-border-soft'
                          }`}
                        >
                          <div className="relative aspect-[4/3] w-full bg-surface">
                            {it.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={it.imageUrl}
                                alt={it.name}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[22px] text-faint">
                                ◌
                              </div>
                            )}
                          </div>
                          <div className="flex flex-1 flex-col p-2.5">
                            <div className="mb-0.5 line-clamp-2 text-[12px] font-medium leading-[1.25] tracking-[-0.01em]">
                              {it.name}
                            </div>
                            <div className="mb-1.5 text-[11px] tabular-nums text-mute">
                              R$ {(it.priceCents / 100).toFixed(2).replace('.', ',')}
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleLinkedSelection(msg.id, it.id)}
                              disabled={msg.orderPlaced}
                              className={`mt-auto flex items-center justify-center rounded-full border-[1.2px] px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                                isSel
                                  ? 'border-ink bg-ink text-white'
                                  : 'border-ink bg-bg text-ink'
                              } disabled:opacity-60`}
                            >
                              {isSel ? '✓ Selecionado' : 'Pedir'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {showConfirm && (
                  <div className="max-w-[90%] self-start rounded-[16px] border border-ink/20 bg-surface px-3.5 py-3 text-[13px] leading-[1.4] text-ink">
                    <div className="mb-2 text-pretty">
                      Quer que eu peça{' '}
                      {msg
                        .linkedItems!.filter((it) => selected.includes(it.id))
                        .map((it, i, arr) => (
                          <span key={it.id}>
                            <b>{it.name}</b>
                            {i < arr.length - 2 ? ', ' : i === arr.length - 2 ? ' e ' : ''}
                          </span>
                        ))}
                      ?
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => confirmLinkedOrder(msg.id)}
                        disabled={placingOrder}
                        className="flex-1 rounded-full bg-ink px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-60"
                      >
                        {placingOrder ? 'Enviando…' : 'Sim, pedir'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setMessages((prev) =>
                            prev.map((m) => (m.id === msg.id ? { ...m, selectedIds: [] } : m)),
                          )
                        }
                        disabled={placingOrder}
                        className="rounded-full border border-ink/30 bg-bg px-3 py-1.5 text-[12px] text-ink disabled:opacity-60"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {loading && (
            <div className="flex max-w-[86%] self-start items-center gap-1.5 rounded-[18px] rounded-bl-[4px] border border-ink bg-bg px-4 py-3">
              <div className="h-1.5 w-1.5 animate-bounce-dot rounded-full bg-ink" />
              <div
                className="h-1.5 w-1.5 animate-bounce-dot rounded-full bg-ink"
                style={{ animationDelay: '0.15s' }}
              />
              <div
                className="h-1.5 w-1.5 animate-bounce-dot rounded-full bg-ink"
                style={{ animationDelay: '0.3s' }}
              />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="shrink-0 pt-1.5">
          <div className="-mx-[22px] flex gap-1.5 overflow-x-auto px-[22px] pb-2 [&::-webkit-scrollbar]:hidden">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                disabled={loading || chipBusy}
                onClick={async () => {
                  if (chipBusy) return;
                  setChipBusy(true);
                  try {
                    await sendMessage(s);
                  } finally {
                    setTimeout(() => setChipBusy(false), 800);
                  }
                }}
                className="shrink-0 whitespace-nowrap rounded-full border border-ink/[0.15] bg-surface px-3.5 py-1.5 text-[12px] text-ink transition-colors duration-100 active:bg-white disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="keyboard-anchor shrink-0 px-[22px] pt-2">
          <SoftInput
            maxLength={2000}
            placeholder="Digite aqui"
            value={input}
            onChange={setInput}
            onSubmit={sendMessage}
            disabled={loading}
          />
        </div>
      </div>
    </AppShell>
  );
}
