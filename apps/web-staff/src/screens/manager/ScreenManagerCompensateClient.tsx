'use client';

// ScreenManagerCompensateClient — V5 canon (canvas garcom-screens-d.jsx:2520).
//
// Destino do botao "Abrir compositor" em ScreenManagerCourtesies (Nova
// cortesia tab). Versao funcional simplificada do canvas:
//   • Selecionar mesa (lista de mesas ativas via GET /host/tables)
//   • Selecionar tipo (Sobremesa/Drink/Couvert/Desconto/Mensagem/Outro)
//   • Item descritivo (textbox)
//   • Notas opcional (textarea)
//   • CTA "Mandar cortesia" -> POST /courtesies (Round 18 endpoint
//     novo · migration 042 + courtesies module)
//
// Os 3 estados elaborados do canvas (select/sent/accepted) com countdown
// + push-confirmation ficam pra Onda 2 — esta versao foca em
// persistencia funcional pra fechar o loop com ScreenManagerCourtesies
// histórico.
//
// Round 18 (Onda 1 wiring): substitui "TODO Onda 2" stub do
// `/manager/compensate` route.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useG,
  G_FONT,
  MONO_FONT,
  MTopBar,
  GIconBtn,
  GButton,
  Icon,
} from '../../components/manager';
import { listHostTables, type HostTableEntry } from '../../lib/api/host';
import { manager, type CreateCourtesyPayload } from '../../lib/api/manager';

const COURTESY_TYPES: {
  id: CreateCourtesyPayload['type'];
  label: string;
  sub: string;
  defaultItem: string;
}[] = [
  { id: 'Sobremesa', label: 'Sobremesa', sub: 'Da casa', defaultItem: 'Fondant de chocolate · 2 porções' },
  { id: 'Drink', label: 'Drink', sub: 'Bar manda', defaultItem: 'Caipirinha · 2 doses' },
  { id: 'Couvert', label: 'Couvert', sub: 'Por conta', defaultItem: 'Couvert (R$ 18) sai da conta' },
  { id: 'Desconto', label: 'Desconto', sub: '% no total', defaultItem: '15% de desconto na conta' },
  { id: 'Mensagem', label: 'Mensagem', sub: 'Sem brinde', defaultItem: 'Obrigado pela visita!' },
  { id: 'Outro', label: 'Outro', sub: 'Personalizado', defaultItem: '' },
];

export interface ScreenManagerCompensateClientProps {
  dark?: boolean;
  /** Mesa pre-selecionada (passada por TableMenu via ?tableNumber=N). */
  preselectedTableNumber?: number;
  /** TableSessionId pre-selecionado (passado via ?tableSessionId=). */
  preselectedTableSessionId?: string;
  tenantSlug?: string;
}

export function ScreenManagerCompensateClient({
  dark = false,
  preselectedTableNumber,
  preselectedTableSessionId,
  tenantSlug,
}: ScreenManagerCompensateClientProps) {
  const C = useG(dark);
  const router = useRouter();

  const slug =
    tenantSlug ??
    (typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('slug') ?? undefined
      : undefined) ??
    process.env.NEXT_PUBLIC_TENANT_SLUG ??
    'demo';

  const [tables, setTables] = useState<HostTableEntry[]>([]);
  const [loadingTables, setLoadingTables] = useState(true);
  const [selectedTableNumber, setSelectedTableNumber] = useState<number | null>(
    preselectedTableNumber ?? null,
  );
  const [selectedTableSessionId, setSelectedTableSessionId] = useState<
    string | null
  >(preselectedTableSessionId ?? null);
  const [type, setType] = useState<CreateCourtesyPayload['type']>('Sobremesa');
  const [item, setItem] = useState(COURTESY_TYPES[0].defaultItem);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listHostTables(slug)
      .then((rows) => {
        if (cancelled) return;
        // Filtra so mesas ocupadas — cortesia generica sem mesa fica
        // pra futuro
        setTables(rows.filter((t) => t.active_session_id));
        setLoadingTables(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadingTables(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const onPickTable = (t: HostTableEntry) => {
    setSelectedTableNumber(t.number);
    setSelectedTableSessionId(t.active_session_id ?? null);
  };

  const onPickType = (id: CreateCourtesyPayload['type']) => {
    setType(id);
    const def = COURTESY_TYPES.find((c) => c.id === id);
    if (def) setItem(def.defaultItem);
  };

  const validate = (): string | null => {
    if (!selectedTableNumber) return 'Escolha uma mesa.';
    if (!item.trim()) return 'Descreva o item da cortesia.';
    return null;
  };

  const onSubmit = async () => {
    const err = validate();
    if (err) {
      setErrorMsg(err);
      return;
    }
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const created = await manager(slug).courtesies.create({
        type,
        item: item.trim(),
        tableNumber: selectedTableNumber!,
        tableSessionId: selectedTableSessionId ?? undefined,
        notes: notes.trim() || undefined,
      });
      setSavedId(created.id);
      setTimeout(() => router.push('/manager/cortesias'), 2000);
    } catch (e) {
      setErrorMsg((e as Error).message || 'Erro ao enviar cortesia.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: C.surface,
        fontFamily: G_FONT,
        color: C.ink,
      }}
    >
      <MTopBar
        dark={dark}
        title="Cortesia"
        left={
          <GIconBtn
            dark={dark}
            icon={Icon.back(20)}
            onClick={() => router.push('/manager/cortesias')}
            ariaLabel="Voltar"
          />
        }
      />

      <div style={{ flex: 1, overflow: 'auto', padding: '0 0 100px' }}>
        <Hero savedId={savedId} selectedTableNumber={selectedTableNumber} />

        {!savedId && (
          <>
            <Section C={C} label={preselectedTableNumber ? `Pra mesa ${preselectedTableNumber} · vinda do menu` : 'Pra qual mesa'}>
              {loadingTables ? (
                <div style={{ padding: 12, fontSize: 12, color: C.faint }}>Carregando mesas…</div>
              ) : tables.length === 0 ? (
                <div
                  style={{
                    padding: 12,
                    border: `1px dashed ${C.borderSoft}`,
                    borderRadius: 10,
                    fontSize: 12,
                    color: C.faint,
                    textAlign: 'center',
                  }}
                >
                  Nenhuma mesa ativa no momento.
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {tables.map((t) => {
                    const isSelected = t.number === selectedTableNumber;
                    return (
                      <button
                        key={t.number}
                        type="button"
                        onClick={() => onPickTable(t)}
                        aria-pressed={isSelected}
                        style={{
                          all: 'unset',
                          cursor: 'pointer',
                          boxSizing: 'border-box',
                          padding: '10px 12px',
                          borderRadius: 12,
                          background: isSelected ? '#2F7D4F' : C.bg,
                          border: `1.5px solid ${isSelected ? '#2F7D4F' : C.borderSoft}`,
                          color: isSelected ? '#fff' : C.ink,
                          minWidth: 78,
                          textAlign: 'center',
                        }}
                      >
                        <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: -0.5 }}>
                          Mesa {t.number}
                        </div>
                        <div
                          style={{
                            fontSize: 10.5,
                            fontWeight: 600,
                            marginTop: 2,
                            opacity: isSelected ? 0.85 : 0.7,
                          }}
                        >
                          {t.seats ?? 0}p · {t.sector}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </Section>

            <Section C={C} label="Tipo de cortesia">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {COURTESY_TYPES.map((t) => {
                  const active = t.id === type;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onPickType(t.id)}
                      aria-pressed={active}
                      style={{
                        all: 'unset',
                        cursor: 'pointer',
                        boxSizing: 'border-box',
                        padding: 12,
                        borderRadius: 12,
                        background: active ? C.ink : C.bg,
                        border: `1.5px solid ${active ? C.ink : C.borderSoft}`,
                        color: active ? C.bg : C.ink,
                        textAlign: 'left',
                      }}
                    >
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{t.label}</div>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 500,
                          opacity: active ? 0.8 : 0.65,
                          marginTop: 2,
                        }}
                      >
                        {t.sub}
                      </div>
                    </button>
                  );
                })}
              </div>
            </Section>

            <Section C={C} label="Descrição">
              <input
                type="text"
                value={item}
                onChange={(e) => setItem(e.target.value)}
                placeholder="Ex.: Fondant de chocolate · 2 porções"
                maxLength={500}
                style={{
                  all: 'unset',
                  boxSizing: 'border-box',
                  width: '100%',
                  padding: '12px 14px',
                  border: `1px solid ${C.borderSoft}`,
                  borderRadius: 10,
                  fontSize: 14,
                  color: C.ink,
                  background: C.bg,
                  fontWeight: 500,
                }}
              />
            </Section>

            <Section C={C} label="Notas internas (opcional)">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, 500))}
                placeholder="Observações pra equipe…"
                rows={3}
                style={{
                  resize: 'none',
                  width: '100%',
                  boxSizing: 'border-box',
                  border: `1px solid ${C.borderSoft}`,
                  borderRadius: 10,
                  background: C.bg,
                  padding: '12px 14px',
                  minHeight: 64,
                  fontFamily: G_FONT,
                  fontSize: 13,
                  color: C.ink,
                  fontWeight: 500,
                  lineHeight: 1.4,
                }}
              />
            </Section>

            {errorMsg && (
              <div
                role="alert"
                style={{
                  margin: '0 16px 14px',
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: '#FFF1F1',
                  border: '1px solid #F4C7C7',
                  color: '#A12626',
                  fontSize: 13,
                  fontWeight: 500,
                  lineHeight: 1.4,
                }}
              >
                {errorMsg}
              </div>
            )}
          </>
        )}
      </div>

      {!savedId && (
        <div
          style={{
            position: 'sticky',
            bottom: 0,
            padding: '12px 16px 18px',
            background: C.bg,
            borderTop: `1px solid ${C.borderSoft}`,
          }}
        >
          <GButton
            dark={dark}
            full
            kind="primary"
            onClick={onSubmit}
            disabled={submitting || !selectedTableNumber || !item.trim()}
          >
            {submitting ? 'Enviando…' : 'Mandar cortesia'}
          </GButton>
        </div>
      )}
    </div>
  );
}

function Hero({
  savedId,
  selectedTableNumber,
}: {
  savedId: string | null;
  selectedTableNumber: number | null;
}) {
  if (savedId) {
    return (
      <div style={{ padding: '16px 16px 4px' }}>
        <div
          style={{
            background: '#EFF3FA',
            border: '1px solid #3B5FBE',
            borderRadius: 14,
            padding: 14,
          }}
        >
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 800,
              color: '#1F3784',
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              marginBottom: 4,
              fontFamily: MONO_FONT,
            }}
          >
            Cortesia registrada
          </div>
          <div
            style={{
              fontSize: 15,
              fontWeight: 800,
              color: '#1F3784',
              letterSpacing: -0.2,
              marginBottom: 4,
            }}
          >
            Cortesia enviada · indo pra Histórico
          </div>
          <div style={{ fontSize: 12.5, color: '#1F3784', fontWeight: 600 }}>
            Em segundos a página vai abrir o histórico das cortesias.
          </div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ padding: '16px 16px 4px' }}>
      <div
        style={{
          background: '#EFF5EC',
          border: '1px solid #2F7D4F',
          borderRadius: 14,
          padding: 14,
        }}
      >
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 800,
            color: '#0F5A37',
            letterSpacing: 0.6,
            textTransform: 'uppercase',
            marginBottom: 4,
            fontFamily: MONO_FONT,
          }}
        >
          Cortesia da casa
        </div>
        <div
          style={{
            fontSize: 15,
            fontWeight: 800,
            color: '#0F5A37',
            letterSpacing: -0.2,
          }}
        >
          {selectedTableNumber
            ? `Mande um mimo pra mesa ${selectedTableNumber}`
            : 'Escolha uma mesa abaixo'}
        </div>
      </div>
    </div>
  );
}

function Section({
  C,
  label,
  children,
}: {
  C: ReturnType<typeof useG>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ padding: '14px 16px 4px' }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: C.faint,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
          marginBottom: 10,
          fontFamily: MONO_FONT,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}
