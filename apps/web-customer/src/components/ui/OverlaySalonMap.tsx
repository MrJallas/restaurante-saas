'use client';

import { useEffect, useState } from 'react';
import { PillButton } from './PillButton';
import { animationClass, useReducedMotion } from '../../lib/animations';

/**
 * Mesa renderizada no mapa. Status guia o tratamento visual:
 *  - 'occupied'  → tap-able (hint do host se tiver)
 *  - 'free'      → atenuada, dashed border, "LIVRE"
 *  - 'distant'   → atenuada porém sólida — "longe da sua mesa"
 *  - 'you'       → mesa do próprio cliente (renderiza badge "VOCÊ TÁ AQUI")
 */
export type SalonTableStatus = 'occupied' | 'free' | 'distant' | 'you';

export interface SalonTable {
  /** Número visível da mesa (ex.: 12, 14). Pode coincidir com label do tenant. */
  num: number;
  /** Código técnico/QR da mesa, ex.: "M14" ou "14". */
  tableCode?: string;
  /** Label exibível da mesa, ex.: "Mesa 14". */
  tableLabel?: string;
  /** Status — controla cor, badge e tap-ability. */
  status: SalonTableStatus;
  /** Identificador da sessão atual da mesa, se ocupada. Volta no callback. */
  sessionId?: string;
  /** Nome curto do "host" (cliente líder da mesa) — ex.: "André", "Casal Lima". */
  host?: string;
  /** Quantidade de pessoas atualmente sentadas. */
  party?: number;
}

export interface SalonZone {
  id: string;
  label: string;
  /**
   * Lista de mesas naquela zona (ordenada conforme aparece no grid).
   * Pra MVP usamos um único grid 3x3 sem dividir por zonas; este campo
   * existe pra que C2/C3 possam estender quando o restaurante tiver
   * múltiplas zonas (Salão, Mezanino, Pátio).
   */
  tables: SalonTable[];
}

interface OverlaySalonMapProps {
  /** Aberto/fechado — controle externo (parent decide). */
  open: boolean;
  /** Mesas a renderizar. */
  tables: SalonTable[];
  /**
   * Zonas (opcional). Quando passado, renderiza headers entre grids.
   * Quando undefined, usa `tables` direto num grid 3-col.
   */
  zones?: SalonZone[];
  /**
   * NÚMERO da mesa que vem pré-selecionada — útil quando a IA já sugeriu
   * junção e abrimos o overlay com uma seleção sticky. Por `num` (não pelo
   * sessionId): o salon/adjacent parou de expor o token da mesa (A07), então
   * a identidade estável do cliente é o número.
   */
  highlightTableNum?: number;
  /** Confirma mesa selecionável no CTA → callback com a mesa escolhida. */
  onSelectTable?: (table: SalonTable) => void | Promise<void>;
  /** Tap no X / overlay backdrop / Esc → fecha. */
  onClose: () => void;
  /**
   * Texto em cima do grid — ex.: "Com qual mesa vocês querem juntar?".
   * Default mais genérico. C2/C3 customizam por feature.
   */
  title?: string;
  /**
   * CTA do bottom — só aparece após seleção. Default "Continuar".
   * Quando undefined, esconde a barra de CTA (modo só-visualização).
   */
  ctaLabel?: string;
  /** Estado de carregamento do mapa real vindo do backend. */
  loading?: boolean;
  /** Mensagem amigável quando o mapa não pôde carregar. */
  error?: string | null;
  /** Mensagem quando não há mesas a exibir. */
  emptyMessage?: string;
}

/**
 * Overlay full-screen do mapa do salão — renderiza o layout de mesas
 * num grid (zonas + mesas) sobre o conteúdo atual, com backdrop blur
 * sutil. Tap-to-select feedback visual; CTA full-width só aparece
 * quando há seleção (alinha cliente-tokens.jsx v16/round 8c).
 *
 * MVP: grid 3-col simples (sem layout espacial real do salão). Quando
 * o tenant subir um floor plan próprio, podemos trocar pela renderização
 * SVG do plano sem mudar a API — `tables` continua sendo source of truth.
 *
 * Animações:
 *  - container: `slide-up-overlay` 220ms ease-out (fade + translate Y)
 *  - CTA bottom: aparece com fade 220ms quando seleção muda
 *
 * Acessibilidade:
 *  - role="dialog", aria-modal="true"
 *  - Esc fecha
 *  - botão fechar com aria-label
 *  - mesas selecionáveis ganham aria-pressed quando selecionadas
 *  - body scroll lock enquanto aberto (mesmo padrão do BottomSheet)
 */
export function OverlaySalonMap({
  open,
  tables,
  zones,
  highlightTableNum,
  onSelectTable,
  onClose,
  title = 'Selecione uma mesa',
  ctaLabel = 'Continuar',
  loading = false,
  error = null,
  emptyMessage = 'Nenhuma mesa encontrada agora.',
}: OverlaySalonMapProps) {
  const reducedMotion = useReducedMotion();
  const [selected, setSelected] = useState<SalonTable | null>(null);

  // Quando o overlay abre, sincroniza seleção inicial via highlight prop.
  // useEffect (não useState inicial) porque o overlay pode ser remontado
  // várias vezes com props diferentes durante o ciclo de vida da tela.
  useEffect(() => {
    if (!open) {
      setSelected(null);
      return;
    }
    if (highlightTableNum != null) {
      const t = tables.find((x) => x.num === highlightTableNum);
      if (t) setSelected(t);
    }
  }, [open, highlightTableNum, tables]);

  // Lock body scroll + Esc handler enquanto aberto (mesmo do BottomSheet).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const animClass = reducedMotion ? '' : animationClass.slideUpOverlay;

  // Quando zones passado, agrupa; senão render flat.
  const groups: { zone?: SalonZone; tables: SalonTable[] }[] = zones
    ? zones.map((z) => ({ zone: z, tables: z.tables }))
    : [{ tables }];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex flex-col justify-end"
    >
      {/* Backdrop — clicável, fecha overlay. backdrop-blur 2px casa com canvas. */}
      <button
        type="button"
        aria-label="Fechar mapa"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
      />

      {/* Sheet com o mapa — sai do bottom, max 80% altura pra deixar
          espaço pro backdrop ser visível e tapeavel pra fechar. */}
      <div
        className={`relative max-h-[85vh] overflow-y-auto rounded-t-[22px] bg-bg pb-safe pt-2 shadow-[0_-10px_40px_rgba(0,0,0,0.18)] ${animClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle — affordância visual de "isso é um sheet". */}
        <div className="mx-auto mb-1 h-1 w-10 rounded-full bg-border-soft" />

        {/* X explícito — alguns usuários não percebem o drag handle ou backdrop.
            Top right pra não competir com o título. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border border-border-soft bg-bg text-ink hover:bg-surface"
        >
          <svg width="13" height="13" viewBox="0 0 18 18" fill="none" aria-hidden>
            <path
              d="M5 5l8 8M13 5l-8 8"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>

        {/* Header */}
        <div className="px-6 pb-4 pt-2">
          <div className="text-[10px] font-semibold uppercase tracking-[1.5px] text-faint">
            Mapa do salão
          </div>
          <h2 className="mt-1.5 text-[19px] font-bold leading-[1.25] tracking-[-0.015em] text-ink">
            {title}
          </h2>
        </div>

        {/* Grids (1 ou N, dependendo de zones) */}
        {loading ? (
          <div className="mx-6 rounded-[12px] border border-border-soft bg-surface px-4 py-5 text-center text-[13px] font-medium text-mute">
            Carregando mesas próximas...
          </div>
        ) : error ? (
          <div className="mx-6 rounded-[12px] border border-border-soft bg-surface px-4 py-5 text-center text-[13px] font-medium text-mute">
            {error}
          </div>
        ) : tables.length === 0 ? (
          <div className="mx-6 rounded-[12px] border border-border-soft bg-surface px-4 py-5 text-center text-[13px] font-medium text-mute">
            {emptyMessage}
          </div>
        ) : (
          groups.map((g, gi) => (
            <div key={g.zone?.id ?? `g-${gi}`} className="px-6 pb-2">
              {g.zone && (
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[1.5px] text-mute">
                  {g.zone.label}
                </div>
              )}
              <div className="grid grid-cols-3 gap-2">
                {g.tables.map((t) => (
                  <SalonTableCell
                    key={`${t.num}-${t.tableCode ?? 'x'}`}
                    table={t}
                    // Casa por `num` (sempre presente, único) — NÃO por sessionId:
                    // o salon/adjacent parou de expor o token da mesa (A07), então
                    // sessionId agora é sempre undefined e a seleção quebraria.
                    isSelected={selected?.num === t.num}
                    onTap={() => {
                      if (t.status !== 'occupied') return;
                      setSelected(t);
                    }}
                  />
                ))}
              </div>
            </div>
          ))
        )}

        {/* Hint — explica visualmente porque mesas atenuadas não dão tap */}
        <div className="px-6 pt-3 font-mono text-[9.5px] font-bold uppercase tracking-[1px] text-faint">
          · mesas atenuadas estão livres ou distantes
        </div>

        {/* Bottom CTA — só com seleção feita */}
        {selected && ctaLabel && (
          <div className="px-6 pb-2 pt-3.5">
            <PillButton
              variant="filled"
              fullWidth
              onClick={() => {
                void onSelectTable?.(selected);
              }}
            >
              {ctaLabel} {selected.host ? `(mesa ${selected.num})` : ''}
            </PillButton>
            {selected.host && (
              <div className="mt-2.5 text-center text-[11.5px] leading-[1.5] tracking-[-0.005em] text-mute">
                {selected.host} ({selected.party} pessoas) vai receber o pedido pra aprovar.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface SalonTableCellProps {
  table: SalonTable;
  isSelected: boolean;
  onTap: () => void;
}

/**
 * Célula individual do grid — extraída pra reduzir cognitive load no
 * componente principal e permitir tweaks visuais por status sem cascata.
 */
function SalonTableCell({ table, isSelected, onTap }: SalonTableCellProps) {
  if (table.status === 'you') {
    return (
      <div
        aria-label={`Sua mesa: ${table.num}`}
        className="flex aspect-square flex-col justify-between rounded-[12px] border-[2.2px] border-ink bg-ink p-2.5 text-white"
      >
        <div className="text-[22px] font-extrabold leading-none tracking-[-0.5px] tabular-nums">
          {table.num}
        </div>
        <div className="font-mono text-[8.5px] font-bold uppercase leading-tight tracking-[1.1px] opacity-90">
          Você tá
          <br />
          aqui
        </div>
      </div>
    );
  }

  const isFree = table.status === 'free';
  const isDistant = table.status === 'distant';
  const dim = isFree || isDistant;
  const tappable = table.status === 'occupied';

  // Borda muda quando selecionado: 2px ink solid (vs 1px borderSoft default).
  const borderClass = isSelected
    ? 'border-2 border-ink'
    : isFree
      ? 'border border-dashed border-border-soft'
      : 'border border-border-soft';

  return (
    <button
      type="button"
      disabled={!tappable}
      onClick={tappable ? onTap : undefined}
      aria-pressed={isSelected}
      aria-label={
        isFree
          ? `Mesa ${table.num}, livre`
          : `Mesa ${table.num}${table.host ? `, ${table.host}` : ''}${
              table.party ? `, ${table.party} pessoas` : ''
            }`
      }
      className={`flex aspect-square flex-col justify-between rounded-[12px] p-2.5 text-left ${borderClass} ${
        isSelected ? 'bg-surface' : 'bg-bg'
      } ${dim ? 'opacity-40' : 'opacity-100'} ${tappable ? 'cursor-pointer' : 'cursor-default'} transition-[background,border] duration-150`}
    >
      <div className="flex items-start justify-between">
        <div className="text-[18px] font-extrabold leading-none tracking-[-0.3px] tabular-nums text-ink">
          {table.num}
        </div>
        {isSelected && (
          <div className="flex h-4 w-4 items-center justify-center rounded-full bg-ink text-white">
            <svg width="10" height="10" viewBox="0 0 18 18" fill="none" aria-hidden>
              <path
                d="M3.5 9.5l3.5 3.5L14 5"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )}
      </div>
      {isFree || isDistant ? (
        <div className="font-mono text-[8.5px] font-bold uppercase tracking-[1px] text-faint">
          {isFree ? 'Livre' : 'Longe'}
        </div>
      ) : (
        <div>
          {table.host && (
            <div className="truncate text-[11px] font-semibold leading-tight tracking-[-0.005em] text-ink">
              {table.host}
            </div>
          )}
          {table.party !== undefined && (
            <div className="mt-0.5 font-mono text-[8.5px] font-bold tracking-[0.8px] text-faint">
              {table.party} pessoas
            </div>
          )}
        </div>
      )}
    </button>
  );
}
