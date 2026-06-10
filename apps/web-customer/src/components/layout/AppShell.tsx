'use client';

import { ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TopBar } from './TopBar';
import { MenuDrawer } from '../ui/MenuDrawer';
import { OverlaySalonMap, type SalonTable } from '../ui/OverlaySalonMap';
import { TableMergeCommandSheet } from '../ui/TableMergeCommandSheet';
import { SessionContext, type CommandMode } from '../../providers/SessionProvider';
import { useTableSocket } from '../../hooks/useTableSocket';
import { apiGet } from '../../lib/api';
import { createTableMergeRequest } from '../../lib/api/customer-host';

type Variant = 'home' | 'default' | 'blank';

interface SalonTablesResponse {
  tables: SalonTable[];
}

const TABLE_MERGE_COMMAND_CHOICE_PREFIX = 'table-merge-command-choice:';

interface AppShellProps {
  slug: string;
  restaurantName: string;
  tableLabel: string;
  variant?: Variant;
  showHamburger?: boolean;
  onBack?: () => void;
  activeHref?: string;
  children: ReactNode;
  /**
   * When true, the outer container removes vertical padding so pages can
   * control their own layout (e.g. full-bleed hero photos).
   */
  noMainPadding?: boolean;
}

export function AppShell({
  slug,
  restaurantName,
  tableLabel,
  variant = 'default',
  showHamburger = true,
  onBack,
  activeHref,
  children,
  noMainPadding = false,
}: AppShellProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const session = useContext(SessionContext);
  const { sessionId } = session;
  const withTopBar = variant !== 'blank';
  const [salonOpen, setSalonOpen] = useState(false);
  const [salonTables, setSalonTables] = useState<SalonTable[]>([]);
  const [salonLoading, setSalonLoading] = useState(false);
  const [salonSubmitting, setSalonSubmitting] = useState(false);
  const [salonError, setSalonError] = useState<string | null>(null);
  const [commandSheetRequestId, setCommandSheetRequestId] = useState<string | null>(null);

  const rememberCommandChoice = useCallback((requestId: string) => {
    try {
      window.sessionStorage.setItem(`${TABLE_MERGE_COMMAND_CHOICE_PREFIX}${requestId}`, '1');
    } catch {
      /* ignore */
    }
  }, []);

  const openCommandSheetOnce = useCallback((requestId?: string | null) => {
    if (!requestId) return;
    try {
      if (window.sessionStorage.getItem(`${TABLE_MERGE_COMMAND_CHOICE_PREFIX}${requestId}`)) {
        return;
      }
    } catch {
      /* ignore */
    }
    setCommandSheetRequestId((current) => current ?? requestId);
  }, []);

  useEffect(() => {
    if (searchParams?.get('mergeApproved') !== '1') return;
    openCommandSheetOnce(searchParams.get('mergeRequestId'));
  }, [searchParams, openCommandSheetOnce]);

  useTableSocket(sessionId, (event, data) => {
    if (event !== 'table_merge.approved') return;
    const payload = (data ?? {}) as { requestId?: string; side?: string };
    if (payload.side !== 'both') return;
    openCommandSheetOnce(payload.requestId);
  });

  useEffect(() => {
    if (!salonOpen || !sessionId) return;
    let cancelled = false;
    setSalonLoading(true);
    setSalonError(null);
    apiGet<SalonTablesResponse>(`/${slug}/salon/tables/adjacent?radius=2`)
      .then((res) => {
        if (cancelled) return;
        setSalonTables(res.tables ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('[drawer] failed to load salon map:', err);
        setSalonTables([]);
        setSalonError('Nao consegui carregar o mapa do salao agora.');
      })
      .finally(() => {
        if (!cancelled) setSalonLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [salonOpen, sessionId, slug]);

  const openTableMergeOverlay = useCallback(() => {
    setSalonError(null);
    setSalonOpen(true);
  }, []);

  const handleSelectMergeTable = useCallback(
    async (table: SalonTable) => {
      if (salonSubmitting) return;
      setSalonSubmitting(true);
      setSalonError(null);
      try {
        const result = await createTableMergeRequest({
          slug,
          targetTableSessionId: table.sessionId,
          targetTableNumber: table.num,
          targetTableLabel: table.tableLabel ?? table.tableCode,
          message: 'Pedido feito pelo menu do cliente.',
        });
        if (!result.ok) {
          setSalonError(
            result.error === 'cooldown'
              ? result.cooldown.message
              : result.message || 'Não consegui criar o pedido de junção agora.',
          );
          return;
        }

        setSalonOpen(false);
        const target =
          result.request.targetTableNumber || table.num || table.tableLabel || 'escolhida';
        const params = new URLSearchParams({
          mode: 'merge-origin',
          requestId: result.request.id,
          expiresAt: result.request.expiresAt,
          hostName: result.request.targetHostName ?? `Mesa ${target}`,
          redirect: `/${slug}/assistente?mergeApproved=1&mergeRequestId=${result.request.id}`,
        });
        router.push(`/${slug}/waiting-approval?${params.toString()}`);
      } finally {
        setSalonSubmitting(false);
      }
    },
    [router, salonSubmitting, slug],
  );

  const closeCommandSheet = useCallback(() => {
    if (commandSheetRequestId) rememberCommandChoice(commandSheetRequestId);
    setCommandSheetRequestId(null);
  }, [commandSheetRequestId, rememberCommandChoice]);

  const chooseCommandMode = useCallback(
    (mode: CommandMode) => {
      if (!mode) return;
      session.setCommandMode(mode, true);
      closeCommandSheet();
    },
    [closeCommandSheet, session],
  );

  return (
    // `contain-paint` isola a arvore do AppShell — quando o MenuDrawer abre
    // por cima, o browser nao invalida a pintura da arvore principal inteira.
    // Resultado pratico em Safari iOS: abrir/fechar drawer ja nao causa
    // repaint global da home/cardapio por tras.
    <div className="contain-paint flex min-h-dvh flex-col bg-bg text-ink">
      {withTopBar && (
        <TopBar
          restaurantName={restaurantName}
          tableLabel={tableLabel}
          onBack={onBack}
          showHamburger={showHamburger}
        />
      )}
      <main
        className={`flex min-h-0 flex-1 flex-col ${
          noMainPadding ? '' : 'px-0 pb-safe pt-0'
        }`}
      >
        {children}
      </main>
      {sessionId && (
        <MenuDrawer
          slug={slug}
          restaurantName={restaurantName}
          tableLabel={tableLabel}
          onOpenTableMerge={openTableMergeOverlay}
          activeHref={activeHref}
        />
      )}
      {sessionId && (
        <>
          <OverlaySalonMap
            open={salonOpen}
            tables={salonTables}
            loading={salonLoading}
            error={salonError}
            title="Com qual mesa vocês querem juntar?"
            ctaLabel={salonSubmitting ? 'Enviando...' : 'Pedir junção'}
            onClose={() => {
              if (!salonSubmitting) setSalonOpen(false);
            }}
            onSelectTable={handleSelectMergeTable}
          />
          <TableMergeCommandSheet
            open={!!commandSheetRequestId}
            onChoose={chooseCommandMode}
            onClose={closeCommandSheet}
          />
        </>
      )}
    </div>
  );
}
