'use client';

// ScreenManagerKitchenReorder — canvas garcom-screens-d.jsx:1818.
//
// State-machine select → sent → accepted. Manager seleciona pedidos
// pra puxar pra frente, adiciona motivo, cozinha confirma.
//
// Backend (TODO Onda 4):
//   • GET /kitchen/queue → fila atual
//   • POST /kitchen/reorder → puxa pedidos selecionados
//   • WebSocket pra accepted state
//
// Por enquanto mock inline + state-machine local. Botão Confirmar
// transita pra "sent" e depois "accepted" via setTimeout — simula o
// fluxo real.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useG,
  G_FONT,
  MONO_FONT,
  MTopBar,
  GIconBtn,
  MPill,
  MBottomNav,
  GButton,
  Icon,
} from '../../components/manager';

interface QueueItem {
  id: string;
  table: number;
  items: string;
  minutes: number;
  meta: number;
  late: boolean;
  waiterInit: string;
  waiterName: string;
}

const QUEUE: QueueItem[] = [
  { id: '#142', table: 14, items: 'Risoto cogumelos', minutes: 22, meta: 12, late: true, waiterInit: 'OM', waiterName: 'Olivia M.' },
  { id: '#143', table: 7, items: 'Filé + risoto · 2 pratos', minutes: 18, meta: 12, late: true, waiterInit: 'CS', waiterName: 'Caleb S.' },
  { id: '#144', table: 9, items: 'Pizza margherita', minutes: 15, meta: 18, late: false, waiterInit: 'HL', waiterName: 'Henrique L.' },
  { id: '#145', table: 12, items: 'Salada césar · 2', minutes: 8, meta: 8, late: false, waiterInit: 'CS', waiterName: 'Caleb S.' },
  { id: '#146', table: 5, items: 'Tagliatelle · 1 prato', minutes: 5, meta: 14, late: false, waiterInit: 'OM', waiterName: 'Olivia M.' },
];

type ReorderState = 'select' | 'sent' | 'accepted';

const heroByState = {
  select: {
    bg: '#FFF1EC',
    bd: '#C2401A',
    fg: '#7A3010',
    label: 'Cozinha lenta agora',
    title: 'Fila com 11 pedidos · 2 já passaram da meta',
    meta: 'Selecione abaixo quais puxar pra frente.',
  },
  sent: {
    bg: '#EFF3FA',
    bd: '#3B5FBE',
    fg: '#1F3784',
    label: 'Aguardando cozinha',
    title: 'Aviso enviado · cozinha vai responder',
    meta: 'Resposta esperada em ~30 segundos.',
  },
  accepted: {
    bg: '#EFF5EC',
    bd: '#1E8C5A',
    fg: '#0F5A37',
    label: 'Cozinha aceitou',
    title: 'Pedidos foram puxados pra frente',
    meta: 'Os garçons das mesas afetadas foram avisados.',
  },
} as const;

export function ScreenManagerKitchenReorder({ dark = false }: { dark?: boolean }) {
  const C = useG(dark);
  const router = useRouter();

  const [state, setState] = useState<ReorderState>('select');
  const [selected, setSelected] = useState<Record<string, boolean>>({
    '#142': true,
    '#143': true,
  });
  const [reason, setReason] = useState(
    'Mesa 14 está há 22 min esperando · cliente comemorando aniversário.',
  );

  const hero = heroByState[state];
  const selectedItems = QUEUE.filter((q) => selected[q.id]);

  const onConfirm = () => {
    if (selectedItems.length === 0) return;
    setState('sent');
    // Mock: cozinha responde em 3s
    setTimeout(() => setState('accepted'), 3000);
  };
  const onCancel = () => setState('select');

  return (
    <div
      style={{
        // Round 18 (Onda 2 sticky-fix): height (not minHeight) + flex-column
        // garante que o footer (CTA "Avisar cozinha") + BottomNav fiquem
        // FORA do scroll do middle. Com minHeight o outer cresceria com
        // o conteúdo do middle e o footer ia pro fim do scroll do body.
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
        title="Alterar ordem de preparo"
        left={
          <GIconBtn
            dark={dark}
            icon={Icon.back(20)}
            onClick={() => router.push('/manager/operacoes')}
            ariaLabel="Voltar"
          />
        }
      />

      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 120 }}>
        {/* Hero */}
        <div style={{ padding: '16px 16px 4px' }}>
          <div
            style={{
              background: hero.bg,
              border: `1px solid ${hero.bd}`,
              borderRadius: 14,
              padding: 14,
            }}
          >
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 800,
                color: hero.fg,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                marginBottom: 4,
                fontFamily: MONO_FONT,
              }}
            >
              {hero.label}
            </div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 800,
                color: hero.fg,
                letterSpacing: -0.2,
                marginBottom: 4,
              }}
            >
              {hero.title}
            </div>
            <div style={{ fontSize: 12.5, color: hero.fg, fontWeight: 600 }}>{hero.meta}</div>
          </div>
        </div>

        {state === 'select' && (
          <>
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
                Fila atual · toque pra selecionar
              </div>
              {QUEUE.map((p) => {
                const sel = !!selected[p.id];
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelected((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                    aria-pressed={sel}
                    style={{
                      all: 'unset',
                      cursor: 'pointer',
                      boxSizing: 'border-box',
                      width: '100%',
                      display: 'flex',
                      gap: 12,
                      padding: 12,
                      marginBottom: 8,
                      background: sel ? '#FFF1EC' : C.bg,
                      border: `1px solid ${sel ? '#C2401A' : C.borderSoft}`,
                      borderRadius: 12,
                    }}
                  >
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        background: sel ? '#C2401A' : 'transparent',
                        border: `1.5px solid ${sel ? '#C2401A' : C.borderSoft}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        marginTop: 2,
                        color: '#fff',
                      }}
                    >
                      {sel && Icon.check(14)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'baseline',
                          justifyContent: 'space-between',
                          gap: 8,
                        }}
                      >
                        <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: -0.2 }}>
                          Mesa {p.table}{' '}
                          <span style={{ color: C.faint, fontWeight: 600, fontSize: 12 }}>· {p.id}</span>
                        </div>
                        {p.late ? (
                          <MPill tone="danger" dark={dark}>
                            {p.minutes} min · atrasada
                          </MPill>
                        ) : (
                          <MPill tone="mute" dark={dark}>
                            {p.minutes} min
                          </MPill>
                        )}
                      </div>
                      <div style={{ fontSize: 12.5, color: C.mute, fontWeight: 500, marginTop: 3 }}>
                        {p.items}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: C.faint,
                          fontWeight: 500,
                          marginTop: 4,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                        }}
                      >
                        <span
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: '50%',
                            background: '#7A4FBE',
                            color: '#fff',
                            fontSize: 8,
                            fontWeight: 800,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {p.waiterInit}
                        </span>
                        {p.waiterName} · meta {p.meta} min
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

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
                Por quê (opcional)
              </div>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value.slice(0, 500))}
                rows={3}
                style={{
                  resize: 'none',
                  width: '100%',
                  boxSizing: 'border-box',
                  border: `1px solid ${C.borderSoft}`,
                  borderRadius: 12,
                  background: C.bg,
                  padding: 12,
                  fontFamily: G_FONT,
                  fontSize: 13,
                  color: C.ink,
                  fontWeight: 500,
                  lineHeight: 1.4,
                }}
              />
              <div style={{ fontSize: 11, color: C.faint, fontWeight: 500, marginTop: 6 }}>
                A cozinha vê o motivo. Ajuda eles a decidir.
              </div>
            </div>
          </>
        )}

        {state !== 'select' && (
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
              Pedidos puxados pra frente
            </div>
            {selectedItems.map((p) => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  gap: 12,
                  padding: 12,
                  marginBottom: 8,
                  background: C.bg,
                  border: `1px solid ${C.borderSoft}`,
                  borderRadius: 12,
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    flexShrink: 0,
                    background: state === 'accepted' ? '#EFF5EC' : '#EFF3FA',
                    color: state === 'accepted' ? '#0F5A37' : '#1F3784',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    fontWeight: 800,
                  }}
                >
                  {p.table}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>
                    Mesa {p.table}{' '}
                    <span style={{ color: C.faint, fontWeight: 600, fontSize: 12 }}>· {p.id}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: C.mute, fontWeight: 500, marginTop: 3 }}>
                    {p.items}
                  </div>
                </div>
              </div>
            ))}
            {reason && (
              <div
                style={{
                  background: C.bg,
                  border: `1px solid ${C.borderSoft}`,
                  borderRadius: 12,
                  padding: 12,
                  fontSize: 12.5,
                  color: C.mute,
                  fontWeight: 500,
                  lineHeight: 1.4,
                  marginTop: 8,
                }}
              >
                <span style={{ color: C.ink, fontWeight: 700 }}>Motivo enviado.</span> {reason}
              </div>
            )}
          </div>
        )}
      </div>

      <div
        style={{
          padding: '12px 16px 18px',
          background: C.bg,
          borderTop: `1px solid ${C.borderSoft}`,
          display: 'flex',
          gap: 8,
          flexShrink: 0,
        }}
      >
        {state === 'select' && (
          <GButton
            dark={dark}
            full
            kind="primary"
            onClick={onConfirm}
            disabled={selectedItems.length === 0}
          >
            Avisar cozinha · {selectedItems.length} pedido{selectedItems.length === 1 ? '' : 's'}
          </GButton>
        )}
        {state === 'sent' && (
          <GButton dark={dark} full kind="ghost" onClick={onCancel}>
            Cancelar pedido de reordem
          </GButton>
        )}
        {state === 'accepted' && (
          <GButton dark={dark} full kind="primary" onClick={() => router.push('/manager/operacoes')}>
            Voltar pra Operação
          </GButton>
        )}
      </div>

      <MBottomNav active="ops" dark={dark} onTo={(r) => router.push(r)} />
    </div>
  );
}
