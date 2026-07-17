'use client';

import Link from 'next/link';
import { ReactNode, useContext, useEffect, useState } from 'react';
import { Merge } from 'lucide-react';
import { SessionContext } from '../../providers/SessionProvider';
import { useUIState } from '../../providers/UIStateProvider';
import { useNav } from '../../hooks/useNav';
import { useDraftOrder } from '../../providers/DraftOrderProvider';
import { logoutCustomer } from '../../lib/api/customer-auth';
import { orderSummarySubtitle, type DrawerOrderSummary } from './menuDrawerSummary';

interface MenuDrawerProps {
  slug: string;
  restaurantName: string;
  tableLabel: string;
  orderSummary?: DrawerOrderSummary | null;
  tableOrderSummary?: {
    items: number;
    people: number;
    newCount?: number;
  } | null;
  onOpenTableMerge?: () => void;
  activeHref?: string;
  participantsCount?: number;
}

export function MenuDrawer({
  slug,
  restaurantName,
  tableLabel,
  orderSummary,
  tableOrderSummary,
  onOpenTableMerge,
  activeHref,
  participantsCount,
}: MenuDrawerProps) {
  const { drawerOpen, closeDrawer, openCallWaiterSheet } = useUIState();
  const { customerName, clearSession } = useContext(SessionContext);
  const { clear: clearDraft } = useDraftOrder();
  const { push } = useNav();
  const [exitKind, setExitKind] = useState<'switch' | 'leave' | null>(null);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer();
    };
    document.addEventListener('keydown', onKey);

    // iOS Safari NAO trava scroll com `overflow: hidden` no body — o
    // momentum/rubber-band passa por cima e a pagina debaixo desliza,
    // fazendo o drawer "soltar" da tela quando o usuario rola.
    // Solucao classica: `position: fixed` no body + restaurar a posicao
    // de scroll no cleanup. Salvamos os estilos anteriores em ref pra
    // sobreviver a re-renders/StrictMode sem leak.
    const scrollY = window.scrollY;
    const prev = {
      position: document.body.style.position,
      top: document.body.style.top,
      left: document.body.style.left,
      right: document.body.style.right,
      width: document.body.style.width,
      overflow: document.body.style.overflow,
    };
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.position = prev.position || '';
      document.body.style.top = prev.top || '';
      document.body.style.left = prev.left || '';
      document.body.style.right = prev.right || '';
      document.body.style.width = prev.width || '';
      document.body.style.overflow = prev.overflow || '';
      // Restaura o scroll sem `behavior: smooth` pra evitar "fly-back".
      window.scrollTo(0, scrollY);
    };
  }, [drawerOpen, closeDrawer]);

  if (!drawerOpen) return null;

  const sessionStart = (() => {
    try {
      const raw =
        typeof window !== 'undefined' ? window.sessionStorage.getItem('session:startedAt') : null;
      if (!raw) return null;
      const d = new Date(raw);
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return null;
    }
  })();

  const orderSub = orderSummarySubtitle(orderSummary);

  const tableSub = tableOrderSummary
    ? `Comanda compartilhada · ${tableOrderSummary.items} itens`
    : 'Comanda compartilhada';

  const tableBadge =
    tableOrderSummary && tableOrderSummary.newCount && tableOrderSummary.newCount > 0
      ? `${tableOrderSummary.newCount} novos`
      : undefined;

  const handleExit = async (kind: 'switch' | 'leave') => {
    if (exitKind) return;
    setExitKind(kind);
    setLogoutError(null);
    try {
      await logoutCustomer(slug);
      clearDraft();
      clearSession();
      closeDrawer();
      push(kind === 'switch' ? `/${slug}` : '/');
    } catch (error) {
      setLogoutError(
        error instanceof Error ? error.message : 'Não consegui sair com segurança. Tente de novo.',
      );
      setExitKind(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/35" onClick={closeDrawer} />

      <aside
        className="absolute right-0 top-0 bottom-0 flex w-[300px] flex-col border-l-[1.5px] border-ink bg-bg shadow-[-20px_0_60px_rgba(0,0,0,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border-soft px-[22px] pt-12 pb-[22px]">
          <div className="mb-3.5 flex items-start justify-between">
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-[1.5px] text-mute">
                {tableLabel} · {restaurantName}
              </div>
              <div className="text-[20px] font-semibold tracking-[-0.02em]">
                Olá, {customerName?.split(' ')[0] ?? 'visitante'}
              </div>
            </div>
            <button
              type="button"
              onClick={closeDrawer}
              aria-label="Fechar menu"
              className="flex h-11 w-11 items-center justify-center rounded-full border-[1.2px] border-ink text-ink"
            >
              ×
            </button>
          </div>
          <div className="flex items-center gap-2 rounded-[10px] border border-border-soft bg-surface px-3 py-2">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            <span className="text-[11px] text-mute">
              Sessão ativa{participantsCount ? ` · ${participantsCount} pessoas na mesa` : ''}
            </span>
          </div>

          {/* CTA fixo no header do drawer pra "voltar a falar com a IA"
              de qualquer pagina — pedido explicito do usuario. So aparece
              quando ja nao estamos em /assistente, pra nao ser ruido. */}
          {!activeHref?.endsWith('/assistente') && (
            <Link
              href={`/${slug}/assistente`}
              onClick={closeDrawer}
              className="mt-3 flex items-center justify-between rounded-[12px] border-[1.3px] border-ink bg-ink px-3.5 py-3 text-bg active:opacity-90"
            >
              <span className="flex items-center gap-2.5">
                <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full border-[1.2px] border-bg text-[13px]">
                  ✦
                </span>
                <span className="text-[13px] font-semibold tracking-[-0.008em]">
                  Voltar ao assistente
                </span>
              </span>
              <span className="text-[14px]">›</span>
            </Link>
          )}
        </div>

        <nav className="flex-1 overflow-auto py-3.5">
          <DrawerLink
            href={`/${slug}/cardapio`}
            onNavigate={closeDrawer}
            icon="☰"
            label="Cardápio"
            sub="Explorar pratos e bebidas"
            active={activeHref?.startsWith(`/${slug}/cardapio`)}
          />
          <DrawerLink
            href={`/${slug}/pedido`}
            onNavigate={closeDrawer}
            icon="◉"
            label="Meu pedido"
            sub={orderSub}
            active={activeHref?.endsWith('/pedido')}
          />
          <DrawerLink
            href={`/${slug}/pedido/mesa`}
            onNavigate={closeDrawer}
            icon="⊞"
            label="Pedido da mesa"
            sub={tableSub}
            badge={tableBadge}
            active={activeHref?.endsWith('/pedido/mesa')}
          />
          <DrawerAction
            onClick={() => {
              closeDrawer();
              onOpenTableMerge?.();
            }}
            icon={<Merge size={16} strokeWidth={1.8} aria-hidden />}
            label="Juntar mesas"
            sub="Abrir mapa do salão"
          />
          <DrawerLink
            href={`/${slug}/cortesias`}
            onNavigate={closeDrawer}
            icon="✶"
            label="Cortesias"
            sub="Histórico dos últimos 30 dias"
            active={activeHref?.startsWith(`/${slug}/cortesias`)}
          />
          <DrawerLink
            href={`/${slug}/assistente`}
            onNavigate={closeDrawer}
            icon="✦"
            label="Assistente IA"
            sub="Sugestões e dúvidas"
            active={activeHref?.endsWith('/assistente')}
          />
          <DrawerAction
            onClick={() => {
              closeDrawer();
              openCallWaiterSheet();
            }}
            icon="◔"
            label="Chamar garçom"
            sub="Pedir atendimento"
          />
          <DrawerLink
            href={`/${slug}/conta`}
            onNavigate={closeDrawer}
            icon="$"
            label="Pagar conta"
            sub="Fechar a conta"
            active={activeHref?.includes('/pagamento') || activeHref?.includes('/conta')}
          />

          <div className="mx-[22px] my-3.5 h-px bg-border-soft" />

          {/* Staff inbox entry · per the customer-staff-messages module.
              Listed BEFORE "Conversas com IA" because the staff thread is
              usually the one the customer cares about pulling up later
              (manager's reply to a complaint, a courtesy note, etc). */}
          <DrawerLink
            href={`/${slug}/staff-messages`}
            onNavigate={closeDrawer}
            icon="✉"
            label="Mensagens com a equipe"
            sub="Gerente, garçom e cozinha"
            active={activeHref?.startsWith(`/${slug}/staff-messages`)}
          />

          {/* Renomeado em feat/staff-messages-history: "Histórico de chats"
              → "Conversas com IA" pra distinguir do novo inbox da equipe.
              Mesma rota / mesma tela. */}
          <DrawerLink
            href={`/${slug}/chat-history`}
            onNavigate={closeDrawer}
            icon="↻"
            label="Conversas com IA"
            sub="Suas conversas com o assistente"
            active={activeHref?.startsWith(`/${slug}/chat-history`)}
          />

          <DrawerLink
            href={`/${slug}/eu`}
            onNavigate={closeDrawer}
            icon="◐"
            label="Eu"
            sub="Perfil e privacidade"
            active={activeHref?.endsWith('/eu')}
          />

          <button
            type="button"
            onClick={() => void handleExit('switch')}
            disabled={exitKind !== null}
            className="flex min-h-11 w-full items-center gap-3.5 border-l-[3px] border-transparent px-[22px] py-2.5 text-left transition-colors duration-100 active:bg-surface"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-[1.2px] border-ink text-[12px] text-ink">
              ↺
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium tracking-[-0.008em]">
                {exitKind === 'switch' ? 'Encerrando perfil…' : 'Trocar perfil'}
              </span>
              <span className="mt-px block text-[11px] text-mute">Entrar com outro nome</span>
            </span>
          </button>
          <DrawerLink
            onNavigate={closeDrawer}
            href={`/${slug}/assistente?prefill=${encodeURIComponent('Como funciona este app?')}`}
            icon="?"
            label="Ajuda"
            small
          />
          <button
            type="button"
            onClick={() => void handleExit('leave')}
            disabled={exitKind !== null}
            className="flex w-full items-center gap-3.5 border-l-[3px] border-transparent px-[22px] py-2.5 text-left text-danger transition-colors duration-100 active:bg-surface"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-[1.2px] border-danger text-[12px] text-danger">
              →
            </span>
            <span className="text-[13px] font-medium tracking-[-0.008em]">
              {exitKind === 'leave' ? 'Saindo…' : 'Sair da mesa'}
            </span>
          </button>
          {logoutError && (
            <p role="alert" className="px-[22px] py-2 text-[11px] leading-[1.4] text-danger">
              {logoutError}
            </p>
          )}
        </nav>

        <div className="border-t border-border-soft px-[22px] pt-3.5 pb-7 text-center text-[10px] leading-[1.5] text-faint">
          {sessionStart ? `Sessão iniciada às ${sessionStart}` : 'Sessão ativa'}
          <br />
          v1.0 · {restaurantName}
        </div>
      </aside>
    </div>
  );
}

interface DrawerLinkProps {
  href: string;
  onNavigate: () => void;
  icon: ReactNode;
  label: string;
  sub?: string;
  active?: boolean;
  badge?: string;
  small?: boolean;
}

function DrawerLink({ href, onNavigate, icon, label, sub, active, badge, small }: DrawerLinkProps) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`flex items-center gap-3.5 transition-colors duration-100 active:bg-surface ${small ? 'px-[22px] py-2.5' : 'px-[22px] py-3.5'} border-l-[3px] ${
        active ? 'border-ink bg-surface' : 'border-transparent'
      }`}
    >
      <span
        className={`flex shrink-0 items-center justify-center rounded-full border-[1.2px] border-ink text-ink ${
          small ? 'h-7 w-7 text-[12px]' : 'h-[34px] w-[34px] text-[14px]'
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block font-medium tracking-[-0.008em] ${
            small ? 'text-[13px]' : 'text-[15px]'
          }`}
        >
          {label}
        </span>
        {sub && <span className="mt-px block text-[11px] text-mute">{sub}</span>}
      </span>
      {badge && (
        <span className="rounded-full bg-ink px-2 py-[2px] text-[10px] font-semibold text-white">
          {badge}
        </span>
      )}
      {!badge && !small && <span className="text-[14px] text-faint">›</span>}
    </Link>
  );
}

interface DrawerActionProps {
  onClick: () => void;
  icon: ReactNode;
  label: string;
  sub?: string;
}

/** Drawer entry that triggers an action (sheet, modal) instead of navigating. */
function DrawerAction({ onClick, icon, label, sub }: DrawerActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3.5 border-l-[3px] border-transparent px-[22px] py-3.5 text-left transition-colors duration-100 active:bg-surface"
    >
      <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border-[1.2px] border-ink text-[14px] text-ink">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium tracking-[-0.008em]">{label}</span>
        {sub && <span className="mt-px block text-[11px] text-mute">{sub}</span>}
      </span>
      <span className="text-[14px] text-faint">›</span>
    </button>
  );
}
