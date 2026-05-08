'use client';

import { ReactNode, memo } from 'react';

interface ManagerBubbleProps {
  /** Nome do gerente — usado pro avatar inicial e pro label. */
  name?: string;
  /** Cargo, default "Gerente". */
  role?: string;
  /** Conteúdo da mensagem. */
  children: ReactNode;
  /** Timestamp humano leve, ex.: "há 1 min". Mono caps no canto direito. */
  when?: string;
  /**
   * Pill flutuante opcional acima do bubble — ex.: "↓ Pedido novo Mesa 12".
   * Quando preenchido, renderiza como anchor pill (deeplink / scroll target),
   * casado com o pattern Manager → Customer do canvas v14.
   */
  contextPill?: string;
}

/**
 * Bubble do gerente — visualmente distinto da Bubble (cliente/IA): warm bg
 * `surface`, border-left mostarda 3px (var --color-warning), avatar inline
 * + label mono caps tiny "Renata · Gerente · há 1 min" no header.
 *
 * Existe pq o canvas v14 deixa explícito que mensagens humanas do staff NÃO
 * podem se confundir com a voz da IA — é um pacto importante pro usuário
 * confiar que está falando com pessoa quando tá. Por isso:
 *  - bg sutilmente diferente (surface vs ink/bg)
 *  - border-left mostarda (warning) marca presença humana
 *  - avatar inicial em ink-on-white (não a foto, intencional — "casa
 *    institucional" do restaurante não pessoal)
 *  - timestamp mono externo (ancora de momento — "respondeu há 1 min")
 *
 * `memo` evita repintar histórico inteiro a cada keystroke no input
 * (mesmo padrão da Bubble.tsx).
 */
export const ManagerBubble = memo(function ManagerBubble({
  name = 'Gerente',
  role = 'Gerente',
  children,
  when,
  contextPill,
}: ManagerBubbleProps) {
  const initial = name.charAt(0).toUpperCase();

  return (
    <div className="max-w-[86%] self-start">
      {contextPill && (
        // Pill flutuante de contexto — ex.: "↓ Pedido novo Mesa 12". Aparece
        // só quando o callsite quer indicar que o bubble responde a um item
        // específico do feed acima/abaixo. Inline-block pra wrap natural.
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-border-soft bg-warning-wash px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[1px] text-warning">
          {contextPill}
        </div>
      )}
      <div className="rounded-[14px] border border-border-soft border-l-[3px] border-l-warning bg-surface px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="mb-2 flex items-center gap-2">
          <div
            aria-hidden
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-[10px] font-bold tracking-tight text-white"
          >
            {initial}
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-[1.5px] text-ink">
            {name} · {role}
          </span>
          {when && (
            <span className="ml-auto font-mono text-[10px] tracking-[0.5px] text-faint">
              {when}
            </span>
          )}
        </div>
        <div className="text-[14px] leading-[1.45] tracking-[-0.005em] text-ink" style={{ textWrap: 'pretty' as never }}>
          {children}
        </div>
      </div>
    </div>
  );
});
