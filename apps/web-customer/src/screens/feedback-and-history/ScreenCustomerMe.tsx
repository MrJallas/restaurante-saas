'use client';

// ScreenCustomerMe — tela "Eu" do cliente. Substitui o link passivo
// "Trocar perfil" do MenuDrawer por uma tela completa com:
//  · avatar com iniciais + nome + role "Cliente"
//  · contexto da sessão (mesa, restaurante, pessoas na mesa)
//  · acessos rápidos (histórico, pedidos, reclamações)
//  · ações de privacidade (apagar conversas via LGPD tool)
//  · trocar perfil + sair da mesa
//
// Comportamento sem login: se `customerId === null`, renderiza guard CTA
// que leva pra /identify em vez de mostrar a tela vazia.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '../../hooks/useSession';
import { ApiRequestError } from '../../lib/api';
import { deleteAllThreads as deleteAllAiThreads } from '../../lib/api/chat-history';
import { deleteAllThreads as deleteAllStaffThreads } from '../../lib/api/staff-messages';
import { AppShell } from '../../components/layout/AppShell';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { PillButton } from '../../components/ui/PillButton';

interface ScreenCustomerMeProps {
  slug: string;
  restaurantName?: string;
}

function getInitials(name: string | null | undefined): string {
  if (!name) return 'EU';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'EU';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function ScreenCustomerMe({ slug, restaurantName = '' }: ScreenCustomerMeProps) {
  const session = useSession();
  const router = useRouter();
  const [privacySheetOpen, setPrivacySheetOpen] = useState(false);
  const [deleteScope, setDeleteScope] = useState<'staff' | 'ai' | 'all'>('staff');
  const [deleting, setDeleting] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleTrocarPerfil = () => {
    router.push(`/${slug}`);
  };

  const handleLogout = () => {
    try {
      window.sessionStorage.clear();
    } catch {
      /* ignore */
    }
    router.push('/');
  };

  const handleDeleteConversations = async () => {
    if (!session.customerId) return;
    setDeleting(true);
    setDeleteError(null);
    setDeleteMessage(null);
    try {
      if (deleteScope === 'staff' || deleteScope === 'all') {
        await deleteAllStaffThreads(slug);
      }
      if (deleteScope === 'ai' || deleteScope === 'all') {
        await deleteAllAiThreads(slug, session.customerId);
      }
      setDeleteMessage(
        deleteScope === 'staff'
          ? 'Nenhuma mensagem com a equipe por aqui ainda.'
          : deleteScope === 'ai'
            ? 'Nenhuma conversa com IA por aqui ainda.'
            : 'Nenhuma mensagem por aqui ainda.',
      );
    } catch (err) {
      const message =
        err instanceof ApiRequestError
          ? err.message
          : 'Não consegui apagar agora. Tente de novo em instantes.';
      setDeleteError(message);
    } finally {
      setDeleting(false);
    }
  };

  // Guard: sem identificação, manda pra /identify em vez de tela vazia
  // (resolve o bug P0 #13 do relatório E2E pro entry "Eu").
  if (!session.customerId) {
    return (
      <AppShell
        slug={slug}
        restaurantName={restaurantName}
        tableLabel={session.tableLabel ?? ''}
        activeHref={`/${slug}/eu`}
        onBack={() => router.back()}
      >
        <div className="flex flex-1 flex-col px-[22px] pb-10 pt-3">
          <h1 className="mb-1 text-[22px] font-semibold tracking-[-0.02em] text-ink">Eu</h1>
          <p className="mb-5 text-[13px] leading-[1.5] text-mute">
            Você ainda não se identificou nesta visita.
          </p>
          <div className="rounded-[14px] border border-border-soft bg-surface px-4 py-6">
            <div className="mb-2 text-[15px] font-medium text-ink">
              Identifique-se pra acessar seu perfil
            </div>
            <div className="mb-4 text-[13px] leading-[1.5] text-mute">
              Com o seu nome no perfil, você consegue ver seus pedidos, histórico de chats e dar
              avaliação no fim da refeição.
            </div>
            <button
              type="button"
              onClick={() => router.push(`/${slug}/identify`)}
              className="w-full rounded-[12px] border border-ink bg-ink px-4 py-3 text-[14px] font-semibold text-bg active:opacity-90"
            >
              Identificar agora
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  const name = session.customerName ?? 'Visitante';
  const initials = getInitials(name);

  return (
    <AppShell
      slug={slug}
      restaurantName={restaurantName}
      tableLabel={session.tableLabel ?? ''}
      activeHref={`/${slug}/eu`}
      onBack={() => router.back()}
    >
      <div className="flex flex-1 flex-col px-[22px] pb-10 pt-3">
        <h1 className="mb-5 text-[22px] font-semibold tracking-[-0.02em] text-ink">Eu</h1>

        {/* Avatar + nome */}
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="flex h-[88px] w-[88px] items-center justify-center rounded-[22px] bg-ink text-[28px] font-extrabold tracking-[-0.5px] text-bg">
            {initials}
          </div>
          <div className="text-center">
            <div className="text-[20px] font-semibold tracking-[-0.02em] text-ink">{name}</div>
            <div className="mt-1 text-[10px] font-bold uppercase tracking-[1.4px] text-faint">
              Cliente
              {session.isReturning ? ' · Conhecido da casa' : ''}
            </div>
          </div>
        </div>

        {/* Sessão atual */}
        <div className="mb-3 rounded-[14px] border border-border-soft bg-surface px-4 py-3.5">
          <div className="text-[10px] font-bold uppercase tracking-[1.2px] text-faint">
            Sessão atual
          </div>
          <div className="mt-1 text-[15px] font-medium text-ink">
            {session.tableLabel ?? 'Sem mesa'}
            {session.participants.length > 0 && (
              <span className="text-mute"> · {session.participants.length} pessoas</span>
            )}
          </div>
          {session.participants.some((p) => p.customerId === session.customerId && p.isHost) && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-ink px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.6px] text-bg">
              <span>★</span> Anfitriã da mesa
            </div>
          )}
        </div>

        {/* Acessos */}
        <nav className="mb-6 flex flex-col gap-2" aria-label="Atalhos do perfil">
          {/* "Mensagens com a equipe" listada antes de "Conversas com IA"
              porque é o caminho que o customer mais procura quando volta
              à tela (réplica do manager, cortesia, etc). */}
          <MeLink
            icon="✉"
            label="Mensagens com a equipe"
            sub="Gerente, garçom e cozinha"
            onClick={() => router.push(`/${slug}/staff-messages`)}
          />
          <MeLink
            icon="↻"
            label="Conversas com IA"
            sub="Suas conversas com o assistente"
            onClick={() => router.push(`/${slug}/chat-history`)}
          />
          <MeLink
            icon="◉"
            label="Meus pedidos"
            sub="Itens que você pediu hoje"
            onClick={() => router.push(`/${slug}/pedido`)}
          />
          <MeLink
            icon="!"
            label="Reclamações"
            sub="Histórico do atendimento"
            onClick={() => router.push(`/${slug}/complaints`)}
          />
        </nav>

        {/* Privacidade */}
        <div className="mb-3 text-[10px] font-bold uppercase tracking-[1.2px] text-faint">
          Privacidade
        </div>
        <button
          type="button"
          onClick={() => setPrivacySheetOpen(true)}
          className="mb-2 flex w-full items-center gap-3.5 rounded-[12px] border border-border-soft bg-bg px-4 py-3 text-left active:bg-surface"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-ink text-[12px]">
            ⌫
          </span>
          <span className="flex-1">
            <span className="block text-[14px] font-medium text-ink">Apagar minhas conversas</span>
            <span className="mt-0.5 block text-[11px] text-mute">
              Equipe, IA ou todas · efeito imediato
            </span>
          </span>
          <span className="text-[14px] text-faint">›</span>
        </button>

        {deleteMessage && (
          <div className="mb-2 rounded-[12px] border border-success/30 bg-success/10 px-3.5 py-2.5 text-[13px] text-success">
            {deleteMessage}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={handleTrocarPerfil}
            className="rounded-[12px] border border-border-soft bg-bg px-4 py-3 text-[14px] font-medium text-ink active:bg-surface"
          >
            Trocar perfil
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-[12px] border border-danger bg-bg px-4 py-3 text-[14px] font-semibold text-danger active:bg-[#fdf2f2]"
          >
            Sair da mesa
          </button>
        </div>
      </div>

      <BottomSheet
        open={privacySheetOpen}
        onClose={() => (deleting ? null : setPrivacySheetOpen(false))}
        ariaLabel="Apagar conversas"
      >
        <h2 className="mb-2 text-[20px] font-semibold tracking-[-0.02em] text-ink">
          Apagar minhas conversas?
        </h2>
        <p className="mb-4 text-[14px] leading-[1.5] text-mute">
          Vai sumir todas as conversas com a equipe · não tem volta.
        </p>
        <div className="mb-5 grid grid-cols-3 gap-2">
          {[
            ['staff', 'Equipe'],
            ['ai', 'IA'],
            ['all', 'Todas'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setDeleteScope(value as 'staff' | 'ai' | 'all')}
              disabled={deleting}
              className={`rounded-full border px-3 py-2 text-[12px] font-semibold ${
                deleteScope === value
                  ? 'border-ink bg-ink text-bg'
                  : 'border-border-soft bg-bg text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {deleteError && (
          <div className="mb-4 rounded-[12px] border border-danger bg-[#fdf2f2] px-3.5 py-2.5 text-[13px] text-[#7a1f1f]">
            {deleteError}
          </div>
        )}
        <div className="flex flex-col gap-2.5">
          <PillButton
            variant="filled"
            fullWidth
            onClick={handleDeleteConversations}
            disabled={deleting}
            className="!bg-danger !border-danger"
          >
            {deleting ? 'Apagando…' : 'Sim, apagar tudo'}
          </PillButton>
          <PillButton
            variant="outline"
            fullWidth
            onClick={() => setPrivacySheetOpen(false)}
            disabled={deleting}
          >
            Cancelar
          </PillButton>
        </div>
        <p className="mt-5 px-2 text-center text-[10px] font-semibold uppercase leading-[1.5] tracking-[1.2px] text-faint">
          Suas mensagens ficam aqui por 30 dias e são apagadas automaticamente · LGPD Art. 18
        </p>
      </BottomSheet>
    </AppShell>
  );
}

function MeLink({
  icon,
  label,
  sub,
  onClick,
}: {
  icon: string;
  label: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3.5 rounded-[12px] border border-border-soft bg-bg px-4 py-3 text-left active:bg-surface"
    >
      <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full border border-ink text-[14px]">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium text-ink">{label}</span>
        <span className="mt-px block text-[11px] text-mute">{sub}</span>
      </span>
      <span className="text-[14px] text-faint">›</span>
    </button>
  );
}

export default ScreenCustomerMe;
