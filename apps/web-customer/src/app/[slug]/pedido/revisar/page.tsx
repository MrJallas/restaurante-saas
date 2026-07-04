'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { ApiRequestError, apiGet, apiPatch, apiPost } from '../../../../lib/api';
import { buildOrderItemPayload } from '../../../../lib/orderPayload';
import { useDraftOrder } from '../../../../providers/DraftOrderProvider';
import { useSession } from '../../../../hooks/useSession';
import { useNav } from '../../../../hooks/useNav';
import { AppShell } from '../../../../components/layout/AppShell';
import { PillButton } from '../../../../components/ui/PillButton';
import { Row } from '../../../../components/ui/Row';

export default function PedidoRevisarPage() {
  const params = useParams();
  const { push } = useNav();
  const { tableLabel, visitId, customerId } = useSession();
  const slug = params.slug as string;
  const { items, updateItem, removeItem, totalCents } = useDraftOrder();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [editingNoteFor, setEditingNoteFor] = useState<string | null>(null);

  const fmt = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;

  const checkCanOrder = async (): Promise<boolean> => {
    if (!customerId) {
      setSubmitError('Identifique-se novamente pela tela da mesa antes de pedir.');
      return false;
    }
    try {
      const res = await apiGet<{
        participants: { customerId: string; status: 'pending' | 'approved' | 'rejected' }[];
      }>(`/${slug}/table/participants`);
      const me = res.participants.find((p) => p.customerId === customerId);
      if (me?.status === 'approved') return true;
      if (me?.status === 'pending') {
        setSubmitError('Sua entrada ainda esta aguardando aprovacao do host da mesa.');
        return false;
      }
      setSubmitError(
        'Sua entrada nesta mesa ainda nao esta aprovada. Volte para a tela da mesa ou peca ajuda ao garcom.',
      );
      return false;
    } catch {
      return true;
    }
  };

  const handleSubmit = async () => {
    if (items.length === 0) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const canOrder = await checkCanOrder();
      if (!canOrder) {
        setSubmitting(false);
        return;
      }
      // Carrinho misto (individual + mesa) vira UM order POR billingMode —
      // o split de pagamento filtra por billing_mode e assume orders
      // homogêneos; antes tudo caía num order só com o modo do 1º item.
      const groupedByMode = items.reduce<Record<string, typeof items>>((acc, it) => {
        acc[it.commandMode] ??= [];
        acc[it.commandMode].push(it);
        return acc;
      }, {});
      const groups = Object.entries(groupedByMode) as Array<['individual' | 'table', typeof items]>;
      const createdIds: string[] = [];
      try {
        for (const [billingMode, groupItems] of groups) {
          const res = await apiPost<{ id: string; autoConfirmAt?: string }>(`/${slug}/orders`, {
            billingMode,
            visitId: visitId || undefined,
            // As preferências de bebida ('sem gelo', 'sem açúcar') são dobradas
            // dentro de `notes` pelo buildOrderItemPayload — antes ficavam só no
            // rascunho e a cozinha nunca as recebia (P1-N re-scan).
            items: groupItems.map((it) => buildOrderItemPayload(it, customerId)),
          });
          createdIds.push(res.id);
        }
      } catch (err) {
        // Falha parcial: desfaz os já criados (janela pending_confirmation
        // permite cancelar) pra não mandar meio carrinho pra cozinha.
        await Promise.allSettled(
          createdIds.map((id) => apiPatch(`/${slug}/orders/${id}/cancel`, {})),
        );
        throw err;
      }
      if (createdIds.length === 1) {
        push(`/${slug}/pedido/confirmando?orderId=${createdIds[0]}`);
      } else {
        push(`/${slug}/pedido/confirmando?orderIds=${createdIds.join(',')}`);
      }
    } catch (err) {
      if (
        err instanceof ApiRequestError &&
        (err.body?.error_code === 'CUSTOMER_NOT_APPROVED_FOR_TABLE' ||
          /nao fazem parte desta mesa|não fazem parte desta mesa/i.test(err.message))
      ) {
        setSubmitError(
          'Sua entrada nesta mesa ainda nao esta aprovada. Volte para a tela da mesa ou peca ajuda ao garcom.',
        );
        setSubmitting(false);
        return;
      }
      setSubmitError(err instanceof Error ? err.message : 'Erro ao criar pedido. Tente novamente.');
      setSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <AppShell
        slug={slug}
        restaurantName=""
        tableLabel={tableLabel || ''}
        activeHref={`/${slug}/pedido/revisar`}
        noMainPadding
        onBack={() => push(`/${slug}/cardapio`)}
      >
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-[1.5px] border-border-soft text-[28px] text-faint">
            ◔
          </div>
          <div>
            <div className="mb-1 text-[18px] font-semibold tracking-[-0.02em]">
              Você ainda não escolheu nada
            </div>
            <div className="text-[13px] leading-[1.5] text-mute">
              Adicione itens do cardápio para revisar o pedido.
            </div>
          </div>
          <PillButton variant="filled" onClick={() => push(`/${slug}/cardapio`)}>
            Ver cardápio
          </PillButton>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      slug={slug}
      restaurantName=""
      tableLabel={tableLabel || ''}
      activeHref={`/${slug}/pedido/revisar`}
      noMainPadding
      onBack={() => push(`/${slug}/cardapio`)}
    >
      <div className="flex flex-1 flex-col">
        <div className="shrink-0 px-[22px] pb-1.5 pt-1">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[1.5px] text-mute">
            Antes de enviar
          </div>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Revise seu pedido</h1>
          <p className="mt-1 text-[12px] text-mute">
            Confira os itens antes de mandar para a cozinha.
          </p>
        </div>

        <div className="flex-1 overflow-auto px-[22px] pb-5 pt-3">
          {items.map((it) => {
            const lineTotal = it.priceCents * it.quantity;
            const isEditing = editingNoteFor === it.draftId;
            return (
              <div
                key={it.draftId}
                className="flex items-start gap-3 border-b border-border-soft py-3.5"
              >
                <div className="flex flex-col items-center gap-1">
                  <button
                    type="button"
                    aria-label="Diminuir"
                    onClick={() =>
                      it.quantity > 1
                        ? updateItem(it.draftId, { quantity: it.quantity - 1 })
                        : removeItem(it.draftId)
                    }
                    className="flex h-[26px] w-[26px] items-center justify-center rounded-md border-[1.2px] border-ink bg-bg text-[13px] font-semibold"
                  >
                    −
                  </button>
                  <div className="text-[13px] font-semibold tabular-nums">{it.quantity}</div>
                  <button
                    type="button"
                    aria-label="Aumentar"
                    onClick={() => updateItem(it.draftId, { quantity: it.quantity + 1 })}
                    className="flex h-[26px] w-[26px] items-center justify-center rounded-md border-[1.2px] border-ink bg-ink text-[13px] font-semibold text-white"
                  >
                    +
                  </button>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <div className="text-[15px] font-medium tracking-[-0.01em]">
                      {it.name}
                      {it.size && (
                        <span className="ml-1.5 text-[11px] font-normal text-mute">
                          · {it.size}
                        </span>
                      )}
                    </div>
                    <div className="shrink-0 whitespace-nowrap text-[14px] font-semibold tabular-nums">
                      {fmt(lineTotal)}
                    </div>
                  </div>
                  <div className="mb-1.5 text-[11px] text-mute tabular-nums">
                    {fmt(it.priceCents)} cada ·{' '}
                    {it.commandMode === 'table' ? 'comanda da mesa' : 'minha comanda'}
                  </div>
                  {it.preferences && it.preferences.length > 0 && (
                    <div className="mb-1 text-[11px] text-mute">{it.preferences.join(' · ')}</div>
                  )}
                  {isEditing ? (
                    <textarea
                      autoFocus
                      defaultValue={it.note ?? ''}
                      onBlur={(e) => {
                        updateItem(it.draftId, { note: e.target.value.trim() });
                        setEditingNoteFor(null);
                      }}
                      rows={2}
                      className="w-full resize-none rounded-[10px] border-[1.2px] border-ink bg-bg p-2 text-[12px] text-ink outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingNoteFor(it.draftId)}
                      className={`flex w-full items-center justify-between rounded-[10px] border-[1.2px] px-3 py-2 text-[12px] ${
                        it.note
                          ? 'border-border-soft border-solid text-ink'
                          : 'border-dashed border-faint italic text-faint'
                      }`}
                    >
                      <span className="truncate">{it.note || '+ adicionar observação'}</span>
                      {it.note && (
                        <span className="shrink-0 text-[11px] text-mute underline">editar</span>
                      )}
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  aria-label="Remover"
                  onClick={() => removeItem(it.draftId)}
                  className="pt-0.5 text-[16px] text-faint"
                >
                  ×
                </button>
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => push(`/${slug}/cardapio`)}
            className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-[14px] border-[1.3px] border-dashed border-border-soft px-4 py-3.5 text-[13px] text-mute"
          >
            <span className="text-[16px]">+</span>
            <span>Adicionar mais um item</span>
          </button>

          <div className="mt-5 border-t-[1.3px] border-ink pt-4">
            <Row label="Subtotal" value={fmt(totalCents)} />
            <div className="h-2.5" />
            <Row
              label={<b className="text-[16px] text-ink">Total estimado</b>}
              value={<b className="text-[20px] text-ink tabular-nums">{fmt(totalCents)}</b>}
            />
          </div>

          <div className="mt-3.5 flex items-start gap-2 rounded-[12px] border border-border-soft bg-surface p-3 text-[11px] leading-[1.5] text-mute">
            <span className="text-[12px]">ⓘ</span>
            <span className="text-pretty">
              Após confirmar, você terá <b className="text-ink">15 segundos</b> para revisar antes
              do pedido ir para a cozinha.
            </span>
          </div>

          {submitError && (
            <div className="mt-3.5 rounded-[12px] border border-danger/30 bg-danger/5 p-3 text-[12px] text-danger">
              {submitError}
            </div>
          )}
        </div>

        <div className="flex shrink-0 gap-2.5 px-[22px] pb-safe pb-6 pt-2.5">
          <PillButton onClick={() => push(`/${slug}/cardapio`)} className="flex-1">
            Adicionar mais
          </PillButton>
          <PillButton
            variant="filled"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-[2]"
          >
            {submitting ? 'Enviando…' : 'Enviar para cozinha →'}
          </PillButton>
        </div>
      </div>
    </AppShell>
  );
}
