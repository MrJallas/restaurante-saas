'use client';

import { ReactNode, useContext } from 'react';
import { TopBar } from './TopBar';
import { MenuDrawer } from '../ui/MenuDrawer';
import { SessionContext } from '../../providers/SessionProvider';

type Variant = 'home' | 'default' | 'blank';

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
  const { sessionId } = useContext(SessionContext);
  const withTopBar = variant !== 'blank';

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
          activeHref={activeHref}
        />
      )}
    </div>
  );
}
