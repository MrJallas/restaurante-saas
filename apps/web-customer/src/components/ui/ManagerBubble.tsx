'use client';

import { ReactNode, memo } from 'react';
import { cManagerArrive, useReducedMotion } from '../../lib/animations';

/**
 * Kinds de chip-action exibidos como `ChipActionInset` dentro do mesmo card
 * `ManagerBubble` (per `docs/design/canvas/docs/features/complaint-flow-v12.md`,
 * spec do designer, §`ChipActionInset`). Mirror de
 * `ComplaintChipAction` em `@restaurant/shared-types/complaint`. `custom` ⇒
 * sem inset (resposta puramente em prosa livre).
 *
 * Labels canônicos (mesma spec do designer, §`ChipActionInset`):
 *  - `on-the-way`    "Já estou indo"           (chega em alguns min)
 *  - `kitchen-check` "Vou verificar com a cozinha"
 *  - `courtesy`      "Estou enviando uma cortesia"
 *  - `custom`        free-text, sem inset
 */
export type ManagerChipActionKind = 'on-the-way' | 'kitchen-check' | 'courtesy' | 'custom';

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
  /**
   * Chip-action inset opcional dentro do mesmo card, separado da prosa por
   * border-top + eyebrow mono caps + ícone outline 28×28. Não é card
   * separado nem floating. `null` ou `'custom'` ⇒ não renderiza inset.
   */
  chipAction?: ManagerChipActionKind | null;
  /**
   * Override opcional pro label do inset — útil quando `chipAction='custom'`
   * e o backend mandou um texto livre. Ignora a label canônica em
   * `chipActionLabel` quando preenchido.
   */
  chipActionLabel?: string;
}

/**
 * Labels canônicos do chip-action. O cliente sempre vê estas strings — espelho
 * direto dos chips que o gerente clicou no painel. Mantém a paridade
 * "Manager → Customer" do canvas v14 (mesma palavra do staff vai pro chat).
 */
const chipActionLabel: Record<Exclude<ManagerChipActionKind, 'custom'>, string> = {
  'on-the-way': 'Já estou indo',
  'kitchen-check': 'Vou verificar com a cozinha',
  courtesy: 'Estou enviando uma cortesia',
};

function ChipActionIcon({ kind }: { kind: Exclude<ManagerChipActionKind, 'custom'> }) {
  // 28×28 circle outline · ícone 14px central · stroke ink.
  return (
    <div
      aria-hidden
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-ink"
    >
      {kind === 'on-the-way' && (
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="7" stroke="var(--color-ink)" strokeWidth="1.5" />
          <path
            d="M10 6 V10 L13 12"
            stroke="var(--color-ink)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {kind === 'kitchen-check' && (
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
          <path
            d="M5 10 L9 14 L15 6"
            stroke="var(--color-ink)"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {kind === 'courtesy' && (
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
          <rect
            x="3"
            y="8"
            width="14"
            height="9"
            rx="1"
            stroke="var(--color-ink)"
            strokeWidth="1.5"
          />
          <path d="M3 11 H17" stroke="var(--color-ink)" strokeWidth="1.5" />
          <path d="M10 8 V17" stroke="var(--color-ink)" strokeWidth="1.5" />
          <path
            d="M10 8 C7 6 5 4 7 3 C9 2 10 5 10 8 C10 5 11 2 13 3 C15 4 13 6 10 8 Z"
            stroke="var(--color-ink)"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  );
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
  chipAction,
  chipActionLabel: chipActionLabelOverride,
}: ManagerBubbleProps) {
  const reducedMotion = useReducedMotion();
  const initial = name.charAt(0).toUpperCase();
  // `chipAction` is rendered as an inset only for the 3 canonical kinds.
  // `null`/undefined or `'custom'` skip the inset (the prose carries it).
  const insetKind = chipAction && chipAction !== 'custom' ? chipAction : null;
  const insetLabel = insetKind ? (chipActionLabelOverride ?? chipActionLabel[insetKind]) : null;
  // `cManagerArrive` keyframes (see `lib/animations.ts` + `globals.css`) —
  // 360ms slide-up + fade so when the bubble shows up live (after a
  // `complaint.responded` WS event) it doesn't pop in. Reduced-motion
  // skips the class entirely so globals.css' `prefers-reduced-motion`
  // catch-all has nothing to override.
  const arriveClass = reducedMotion ? '' : cManagerArrive.className;

  return (
    <div className={`max-w-[86%] self-start ${arriveClass}`.trim()}>
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
        <div
          className="text-[14px] leading-[1.45] tracking-[-0.005em] text-ink"
          style={{ textWrap: 'pretty' as never }}
        >
          {children}
        </div>
        {insetKind && insetLabel && (
          // ChipActionInset — separated from the prose by a top border, with
          // a mono-caps eyebrow ("Renata avisou") and an outline 28×28 icon.
          // Per `docs/design/canvas/docs/features/complaint-flow-v12.md`:
          // "inset row dentro do mesmo card".
          <div className="mt-3 flex items-center gap-2.5 border-t border-border-soft pt-3">
            <ChipActionIcon kind={insetKind} />
            <div className="flex flex-col">
              <span className="text-[9.5px] font-bold uppercase leading-tight tracking-[1.2px] text-faint">
                {name} avisou
              </span>
              <span className="text-[13px] font-medium leading-[1.3] tracking-[-0.005em] text-ink">
                {insetLabel}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
