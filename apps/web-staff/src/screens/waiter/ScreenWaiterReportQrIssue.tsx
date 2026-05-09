'use client';

// ScreenWaiterReportQrIssue — formulário pra reportar QR ilegível.
// Match com docs/design-canvas/handoff/garcom/garcom-qr-issue.jsx ::
// ScreenWaiterReportQrIssue (sheet · compose mode + sent state).
// Stepper de número de mesa · chip "tipo do problema" · descrição opcional.

import * as React from 'react';
import { useState } from 'react';
import { useG, G_FONT } from '../../components/waiter/tokens';
import { Icon } from '../../components/waiter/Icons';
import { GAppHeader, GIconBtn } from '../../components/waiter/Primitives';
import { reportQrIssue } from '../../lib/api/waiter';

interface ScreenWaiterReportQrIssueProps {
  tenantSlug: string;
  initialTable?: number;
  onClose?: () => void;
  onSent?: () => void;
}

const PROBLEM_TYPES = [
  { id: 'borrado', label: 'QR borrado' },
  { id: 'descolou', label: 'Descolou' },
  { id: 'rasgado', label: 'Rasgado' },
  { id: 'sumido', label: 'Sumiu' },
  { id: 'outro', label: 'Outro' },
] as const;

type ProblemId = typeof PROBLEM_TYPES[number]['id'];

export const ScreenWaiterReportQrIssue: React.FC<ScreenWaiterReportQrIssueProps> = ({
  tenantSlug, initialTable = 1, onClose, onSent,
}) => {
  const dark = false;
  const C = useG(dark);
  const accent = '#9A7212';
  const [table, setTable] = useState<number>(initialTable);
  const [problem, setProblem] = useState<ProblemId>('borrado');
  const [description, setDescription] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const text = description.slice(0, 200);
      await reportQrIssue(tenantSlug, {
        table_number: table,
        description: text ? `[${problem}] ${text}` : `[${problem}]`,
        photo_url: photoUrl ?? undefined,
      });
      setSent(true);
      setTimeout(() => onSent?.(), 1200);
    } catch (e: unknown) {
      setError((e as Error)?.message ?? 'Erro ao enviar');
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div
        style={{
          width: '100%', minHeight: '100vh', background: C.surface, color: C.ink,
          fontFamily: G_FONT, display: 'flex', flexDirection: 'column',
        }}
      >
        <GAppHeader
          dark={dark}
          left={<GIconBtn dark={dark} icon={Icon.x(20)} onClick={onClose} ariaLabel="Fechar" />}
          title="Reportar QR"
        />
        <div
          style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '40px 24px', textAlign: 'center', gap: 14,
          }}
        >
          <div
            style={{
              width: 64, height: 64, borderRadius: 16, background: C.successBg, color: C.success,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {Icon.check(32)}
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.ink }}>Reportado pra gerente</div>
          <div style={{ fontSize: 14, color: C.mute, fontWeight: 500, lineHeight: 1.5, maxWidth: 280 }}>
            Vamos cuidar disso. Enquanto isso, use <b>Inserir manualmente</b>.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        width: '100%', minHeight: '100vh', background: C.surface, color: C.ink,
        fontFamily: G_FONT, display: 'flex', flexDirection: 'column',
      }}
    >
      <GAppHeader
        dark={dark}
        left={<GIconBtn dark={dark} icon={Icon.x(20)} onClick={onClose} ariaLabel="Fechar" />}
        title="Reportar QR"
      />

      <div style={{ flex: 1, overflow: 'auto', padding: '14px 22px 14px' }}>
        <div
          style={{
            fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
            fontSize: 9.5, fontWeight: 800, letterSpacing: 1.2,
            textTransform: 'uppercase', color: accent,
          }}
        >
          REPORTAR QR
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.ink, marginTop: 6, letterSpacing: -0.3 }}>
          Qual a mesa com QR ilegível?
        </div>
        <div style={{ fontSize: 13, color: C.mute, marginTop: 6, fontWeight: 500, lineHeight: 1.5 }}>
          O gerente vai ver agora · enquanto isso, use{' '}
          <span style={{ fontWeight: 700, color: C.ink }}>Inserir manualmente</span>.
        </div>

        {/* Stepper · número da mesa */}
        <div style={{ paddingTop: 18 }}>
          <div
            style={{
              fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
              fontSize: 9.5, fontWeight: 800, letterSpacing: 1.2,
              textTransform: 'uppercase', color: C.faint, marginBottom: 8,
            }}
          >
            NÚMERO DA MESA
          </div>
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              border: `1.5px solid ${C.ink}`, borderRadius: 14,
              padding: '6px 8px', background: C.bg,
            }}
          >
            <button
              type="button"
              aria-label="Diminuir"
              onClick={() => setTable((t) => Math.max(1, t - 1))}
              style={{
                all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
                width: 44, height: 44, borderRadius: 10,
                background: C.surface, color: C.ink,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {Icon.minus(20)}
            </button>
            <div
              style={{
                fontSize: 32, fontWeight: 800, color: C.ink, letterSpacing: -1,
                fontVariantNumeric: 'tabular-nums', lineHeight: 1,
              }}
            >
              {table}
            </div>
            <button
              type="button"
              aria-label="Aumentar"
              onClick={() => setTable((t) => t + 1)}
              style={{
                all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
                width: 44, height: 44, borderRadius: 10,
                background: C.surface, color: C.ink,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {Icon.plus(20)}
            </button>
          </div>
        </div>

        {/* Chips · tipo do problema */}
        <div style={{ paddingTop: 18 }}>
          <div
            style={{
              fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
              fontSize: 9.5, fontWeight: 800, letterSpacing: 1.2,
              textTransform: 'uppercase', color: C.faint, marginBottom: 8,
            }}
          >
            TIPO DO PROBLEMA
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {PROBLEM_TYPES.map((p) => {
              const active = p.id === problem;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setProblem(p.id)}
                  style={{
                    all: 'unset', cursor: 'pointer',
                    padding: '8px 14px', borderRadius: 100,
                    fontSize: 13, fontWeight: 600,
                    background: active ? C.ink : 'transparent',
                    color: active ? C.bg : C.ink,
                    border: `1.5px solid ${active ? C.ink : C.borderSoft}`,
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Descrição */}
        <div style={{ paddingTop: 18 }}>
          <div
            style={{
              fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
              fontSize: 9.5, fontWeight: 800, letterSpacing: 1.2,
              textTransform: 'uppercase', color: C.faint, marginBottom: 8,
            }}
          >
            DESCRIÇÃO · OPCIONAL
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 200))}
            placeholder="O que rolou? (ex: QR borrado, descolou da mesa…)"
            rows={4}
            style={{
              width: '100%', boxSizing: 'border-box',
              fontFamily: G_FONT, fontSize: 14, color: C.ink,
              padding: '12px 14px', borderRadius: 12,
              border: `1.3px solid ${C.borderSoft}`, background: C.bg,
              resize: 'vertical', outline: 'none',
            }}
          />
          <div
            style={{
              marginTop: 6, display: 'flex', justifyContent: 'flex-end',
              fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, monospace',
              fontSize: 9.5, fontWeight: 700, letterSpacing: 0.7,
              textTransform: 'uppercase', color: C.faint,
            }}
          >
            {description.length} / 200
          </div>
        </div>

        {/* Foto opcional · placeholder pra capture (camera attach) */}
        <div style={{ paddingTop: 12 }}>
          <button
            type="button"
            onClick={() => {
              const url = window.prompt('URL da foto (placeholder)');
              if (url) setPhotoUrl(url);
            }}
            style={{
              all: 'unset', cursor: 'pointer', boxSizing: 'border-box', width: '100%',
              padding: '12px 14px', borderRadius: 12,
              border: `1.3px dashed ${C.borderSoft}`, background: C.bg,
              fontSize: 13, color: C.mute, fontWeight: 600, textAlign: 'center',
            }}
          >
            {photoUrl ? `Foto adicionada · ${photoUrl.slice(0, 30)}…` : '+ Adicionar foto (opcional)'}
          </button>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              marginTop: 14, padding: '10px 12px', borderRadius: 10,
              background: C.dangerBg, color: C.danger,
              fontSize: 13, fontWeight: 600,
            }}
          >
            {error}
          </div>
        )}
      </div>

      <div
        style={{
          // P1 #20: safe-area no rodape do CTA; antes a action bar
          // ficava parcialmente embaixo do home-indicator do iOS.
          padding: '14px 22px max(env(safe-area-inset-bottom), 18px)',
          display: 'flex', flexDirection: 'column', gap: 8,
          borderTop: `1px solid ${C.borderFaint}`, background: C.bg,
          position: 'sticky', bottom: 0,
        }}
      >
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          style={{
            all: 'unset', cursor: submitting ? 'wait' : 'pointer', boxSizing: 'border-box',
            padding: '0 16px', height: 50, borderRadius: 12,
            background: C.ink, color: '#fff',
            fontSize: 15, fontWeight: 700, letterSpacing: -0.1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? 'Enviando...' : 'Reportar pra gerente'}
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            all: 'unset', cursor: 'pointer',
            padding: '12px 16px',
            fontSize: 13, color: C.mute, fontWeight: 600, textAlign: 'center',
          }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
};

export default ScreenWaiterReportQrIssue;
