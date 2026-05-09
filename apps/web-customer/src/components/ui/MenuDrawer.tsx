'use client';

import Link from 'next/link';
import { ReactNode, useContext, useEffect } from 'react';
import { SessionContext } from '../../providers/SessionProvider';
import { useUIState } from '../../providers/UIStateProvider';
import { useNav } from '../../hooks/useNav';

interface MenuDrawerProps {
  slug: string;
  restaurantName: string;
  tableLabel: string;
  orderSummary?: { items: number; totalCents: number } | null;
  tableOrderSummary?: {
    items: number;
    people: number;
    newCount?: number;
  } | null;
  activeHref?: string;
  participantsCount?: number;
}

export function MenuDrawer({
  slug,
  restaurantName,
  tableLabel,
  orderSummary,
  tableOrderSummary,
  activeHref,
  participantsCount,
}: MenuDrawerProps) {
  const { drawerOpen, closeDrawer, openCallWaiterSheet } = useUIState();
  const { customerName } = useContext(SessionContext);
  const { push } = useNav();

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
      document.body.style.position = prev.position;
      document.body.style.top = prev.top;
      document.body.style.left = prev.left;
      document.body.style.right = prev.right;
      document.body.style.width = prev.width;
      document.body.style.overflow = prev.overflow;
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

  const orderSub = orderSummary
    ? `${orderSummary.items} itens · R$ ${(orderSummary.totalCents / 100)
        .toFixed(2)
        .replace('.', ',')}`
    : 'Nenhum item no pedido';

  const tableSub = tableOrderSummary
    ? `Comanda compartilhada · ${tableOrderSummary.items} itens`
    : 'Comanda compartilhada';

  const tableBadge =
    tableOrderSummary && tableOrderSummary.newCount && tableOrderSummary.newCount > 0
      ? `${tableOrderSummary.newCount} novos`
      : undefined;

  const handleLogout = () => {
    try {
      window.sessionStorage.clear();
    } catch {
      /* ignore */
    }
    closeDrawer();
    push('/');
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
              className="flex h-[34px] w-[34px] items-center justify-center rounded-full border-[1.2px] border-ink text-ink"
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
            href={`/${slug}/pagamento`}
            onNavigate={closeDrawer}
            icon="$"
            label="Pagar conta"
            sub="Fechar a conta"
            active={activeHref?.includes('/pagamento')}
          />

          <div className="mx-[22px] my-3.5 h-px bg-border-soft" />

          {/* Chat history entry · per chat-history-lgpd.md "Frontend ·
              Entry point". Routes to ScreenCustomerChatHistory which lets
              the customer review and delete their past AI chats. */}
          <DrawerLink
            href={`/${slug}/chat-history`}
            onNavigate={closeDrawer}
            icon="↻"
            label="Histórico de chats"
            sub="30 dias atrás até hoje"
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

          <DrawerLink
            onNavigate={closeDrawer}
            href={`/${slug}`}
            icon="↺"
            label="Trocar perfil"
            sub="Entrar com outro nome"
            small
          />
          <DrawerLink
            onNavigate={closeDrawer}
            href={`/${slug}/assistente?prefill=${encodeURIComponent('Como funciona este app?')}`}
            icon="?"
            label="Ajuda"
            small
          />
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3.5 border-l-[3px] border-transparent px-[22px] py-2.5 text-left text-danger transition-colors duration-100 active:bg-surface"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-[1.2px] border-danger text-[12px] text-danger">
              →
            </span>
            <span className="text-[13px] font-medium tracking-[-0.008em]">
              Sair da mesa
            </span>
          </button>
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
