'use client';

// Reusable post-mortem template for any resolved manager operation.
// Faithful port of `MOpSummary` (V4 · 2026-05) in garcom-screens-d.jsx.
//
// Used by: pause-summary screen, kitchen-reorder summary, courtesy resolved,
// contact-client read, complaint resolved.

import { useG, G_FONT, MONO_FONT } from './tokens';
import { Icon } from './Icons';
import { GIconBtn, GButton, MTopBar, MPill } from './primitives';

export interface MOpSummaryKpi {
  label: string;
  before?: string | number;
  after?: string | number;
  value?: string | number;
  delta?: string;
  sub?: string;
  accent?: 'success' | 'warn' | 'danger';
}

export interface MOpSummaryTimelineEvent {
  time: string;
  text: string;
  dot?: string;
}

export interface MOpSummarySuggestion {
  text: string;
  ctaLabel?: string;
  onCta?: () => void;
}

export interface MOpSummaryProps {
  dark?: boolean;
  topbarTitle?: string;
  hero?: { kicker?: string; title: string };
  kpis?: MOpSummaryKpi[];
  timeline?: MOpSummaryTimelineEvent[];
  suggestion?: MOpSummarySuggestion | null;
  onBack?: () => void;
  onClose?: () => void;
  primaryCta?: { label: string; onClick?: () => void };
}

export function MOpSummary({
  dark,
  topbarTitle = 'Resumo',
  hero,
  kpis = [],
  timeline = [],
  suggestion,
  onBack,
  primaryCta,
}: MOpSummaryProps) {
  const C = useG(!!dark);
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: C.surface,
        fontFamily: G_FONT,
        color: C.ink,
      }}
    >
      <div style={{ flex: 1, overflow: 'auto' }}>
        <MTopBar
          dark={dark}
          title={topbarTitle}
          left={<GIconBtn dark={dark} icon={Icon.back(20)} onClick={onBack} ariaLabel="Voltar" />}
        />

        {hero && (
          <div style={{ padding: '16px 16px 4px' }}>
            <div
              style={{
                background: '#EFF5EC',
                border: '1px solid #2F7D4F',
                borderRadius: 14,
                padding: 14,
              }}
            >
              {hero.kicker && (
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 800,
                    color: '#0F5A37',
                    letterSpacing: 0.7,
                    textTransform: 'uppercase',
                    marginBottom: 4,
                    fontFamily: MONO_FONT,
                  }}
                >
                  {hero.kicker}
                </div>
              )}
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 800,
                  color: '#0F5A37',
                  letterSpacing: -0.3,
                  lineHeight: 1.25,
                }}
              >
                {hero.title}
              </div>
            </div>
          </div>
        )}

        {kpis.length > 0 && (
          <div style={{ padding: '14px 16px 4px' }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.faint,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                marginBottom: 10,
              }}
            >
              Antes e depois
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${kpis.length}, 1fr)`,
                gap: 8,
              }}
            >
              {kpis.map((k, i) => {
                const accentMap = {
                  success: '#1E8C5A',
                  warn: '#9A7212',
                  danger: '#C43A3A',
                } as const;
                const accent = k.accent ? accentMap[k.accent] : C.ink;
                return (
                  <div
                    key={i}
                    style={{
                      padding: 12,
                      background: C.bg,
                      border: `1px solid ${C.borderSoft}`,
                      borderRadius: 12,
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 9.5,
                        color: C.faint,
                        fontWeight: 700,
                        letterSpacing: 0.6,
                        textTransform: 'uppercase',
                        fontFamily: MONO_FONT,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {k.label}
                    </div>
                    {k.before != null && k.after != null ? (
                      <div style={{ marginTop: 4 }}>
                        <span
                          style={{
                            fontSize: 11,
                            color: C.faint,
                            fontWeight: 600,
                            fontVariantNumeric: 'tabular-nums',
                            textDecoration: 'line-through',
                            textDecorationThickness: 1,
                          }}
                        >
                          {k.before}
                        </span>
                        <span style={{ color: C.faint, margin: '0 4px', fontSize: 10 }}>→</span>
                        <div
                          style={{
                            fontSize: 22,
                            fontWeight: 800,
                            color: C.ink,
                            letterSpacing: -0.5,
                            fontVariantNumeric: 'tabular-nums',
                            lineHeight: 1.1,
                          }}
                        >
                          {k.after}
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{
                          fontSize: 22,
                          fontWeight: 800,
                          color: C.ink,
                          marginTop: 2,
                          letterSpacing: -0.5,
                          fontVariantNumeric: 'tabular-nums',
                          lineHeight: 1.1,
                        }}
                      >
                        {k.value}
                      </div>
                    )}
                    {(k.delta || k.sub) && (
                      <div
                        style={{
                          fontSize: 10,
                          marginTop: 4,
                          fontWeight: 700,
                          color: accent,
                          letterSpacing: 0.2,
                        }}
                      >
                        {k.delta || k.sub}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {timeline.length > 0 && (
          <div style={{ padding: '14px 16px 4px' }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.faint,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                marginBottom: 10,
              }}
            >
              O que aconteceu durante
            </div>
            <ol
              style={{
                background: C.bg,
                border: `1px solid ${C.borderSoft}`,
                borderRadius: 12,
                padding: '6px 14px',
                margin: 0,
                listStyle: 'none',
              }}
            >
              {timeline.map((ev, i) => (
                <li
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    padding: '10px 0',
                    borderBottom: i < timeline.length - 1 ? `1px dashed ${C.borderFaint}` : 'none',
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      flexShrink: 0,
                      fontSize: 11,
                      color: C.faint,
                      fontWeight: 700,
                      fontFamily: MONO_FONT,
                      fontVariantNumeric: 'tabular-nums',
                      letterSpacing: 0.2,
                      paddingTop: 1,
                    }}
                  >
                    {ev.time}
                  </div>
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: ev.dot ?? '#1E8C5A',
                      flexShrink: 0,
                      marginTop: 6,
                    }}
                  />
                  <div
                    style={{
                      flex: 1,
                      fontSize: 13,
                      fontWeight: 500,
                      color: C.ink,
                      lineHeight: 1.4,
                    }}
                  >
                    {ev.text}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}

        {suggestion && (
          <div style={{ padding: '14px 16px 4px' }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.faint,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                marginBottom: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>Próximo passo sugerido</span>
              <MPill tone="info" dark={dark}>
                IA
              </MPill>
            </div>
            <div
              style={{
                background: C.bg,
                border: `1px solid ${C.borderSoft}`,
                borderRadius: 12,
                padding: 14,
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  color: C.ink,
                  fontWeight: 500,
                  lineHeight: 1.5,
                  marginBottom: 10,
                }}
              >
                {suggestion.text}
              </div>
              {suggestion.ctaLabel && (
                <button
                  onClick={suggestion.onCta}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    padding: '8px 14px',
                    borderRadius: 10,
                    background: C.ink,
                    color: C.bg,
                    fontSize: 13,
                    fontWeight: 700,
                    letterSpacing: -0.1,
                  }}
                >
                  {suggestion.ctaLabel}
                </button>
              )}
            </div>
          </div>
        )}

        <div style={{ height: 30 }} />
      </div>

      <div
        style={{
          padding: '12px 16px 18px',
          background: C.bg,
          borderTop: `1px solid ${C.borderSoft}`,
        }}
      >
        <GButton dark={dark} full kind="primary" onClick={primaryCta?.onClick}>
          {primaryCta?.label ?? 'Voltar pro Painel'}
        </GButton>
      </div>
    </div>
  );
}
