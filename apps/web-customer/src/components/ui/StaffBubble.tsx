import { ReactNode, memo } from 'react';

/**
 * Bubble do staff (manager/gerência) inbound — assinatura humana visualmente
 * distinta da Bubble (IA/cliente) e da ManagerBubble (que cobre o sub-fluxo
 * de complaint com chip-action inset).
 *
 * V20 canon (per `docs/design/canvas/handoff/cliente/cliente-tokens.jsx`
 * §`ManagerBubble (4.5)` + `cliente-journey-v20.jsx` §F11_Manager):
 *  - bg `surface` (warm gray) + border 1px `border-soft`
 *  - border-left 3px `ink` (signature stripe — humano, não IA)
 *  - avatar circle 24px `ink` bg + initial em branco
 *  - eyebrow mono caps tiny `"<NAME> · <ROLE>"` (e.g. "RENATA · GERENTE")
 *  - timestamp mono caps tiny right-aligned no faint
 *  - body 14-15px regular ink, line-height 1.45
 *
 * Distinct de:
 *  - `Bubble role='ai'`: sem border-left, plain bg, eyebrow "ASSISTENTE"
 *  - `Bubble role='user'`: ink solid bg, white text, right-aligned
 *  - `ManagerBubble`: border-left 3px **warning** (mostarda) + complaint-flow
 *    chip-action inset. Esse é especificamente pro fluxo de reclamação. O
 *    `StaffBubble` é genérico — todo manager→customer inbound message (Onda
 *    4 batch 2 do round 18) usa este.
 *
 * `memo` evita repintar histórico inteiro a cada keystroke no input (mesmo
 * padrão da Bubble + ManagerBubble).
 */
export interface StaffBubbleProps {
  /** Inicial do nome — render no avatar. Ex: "R". */
  initial: string;
  /** Nome completo (ou primeiro nome) — render na eyebrow. Ex: "Renata". */
  name: string;
  /** Cargo, default "Gerente". Render na eyebrow após "·". */
  roleLabel?: string;
  /** Timestamp humano leve. Ex: "agora", "há 4 min". Mono caps no canto direito. */
  relativeTime: string;
  /** Conteúdo da mensagem (string ou nodes ricos). */
  children: ReactNode;
}

export const StaffBubble = memo(function StaffBubble({
  initial,
  name,
  roleLabel = 'Gerente',
  relativeTime,
  children,
}: StaffBubbleProps) {
  return (
    <div
      className="max-w-[86%] self-start rounded-[14px] rounded-l-[4px] border border-border-soft border-l-[3px] border-l-ink bg-surface px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
      data-staff-bubble="true"
    >
      <div className="mb-2 flex items-center gap-2">
        <div
          aria-hidden
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-[10px] font-bold tracking-tight text-white"
        >
          {initial}
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-[1.5px] text-ink">
          {name} · {roleLabel}
        </span>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.8px] text-faint">
          {relativeTime}
        </span>
      </div>
      <div
        className="text-[14px] leading-[1.45] tracking-[-0.005em] text-ink"
        style={{ textWrap: 'pretty' as never }}
      >
        {children}
      </div>
    </div>
  );
});
