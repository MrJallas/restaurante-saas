'use client';

// ScreenManagerProfile — tela "Eu" do gerente (rota /manager/configuracoes).
// Faithful port of ScreenManagerSettings em
// docs/design-canvas/handoff/garcom/garcom-screens-c.jsx:1889 (V11 layout):
// Hero (avatar lado-a-lado · pulse "em turno desde HH:MM") · Mensagens (bloco
// próprio · V11) · KPI "Vendas no seu turno" · Operação (Encerrar turno
// destacado mostarda · Histórico · Equipe e turnos · Cortesias) · Conta ·
// Estabelecimento (só owner) · Sair em vermelho · footer versão.

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  useG,
  G_FONT,
  Icon,
  MAppHeader,
  MBottomNav,
  MAvatar,
  MSection,
  GIconBtn,
} from '../../components/manager';

export interface ScreenManagerProfileProps {
  dark?: boolean;
  managerName?: string;
  managerInitials?: string;
  managerColor?: string;
  shift?: string;
  shiftStartedAt?: string; // ex "17:02"
  role?: 'manager' | 'owner';
  unreadMessages?: number;
  bellBadge?: number;
  /** Faturamento no turno atual em centavos. */
  salesCentsThisShift?: number;
  tablesServedThisShift?: number;
  avgTicketCents?: number;
  /** Versão exibida no footer. */
  appVersion?: string;
  buildDate?: string;
  /** Linha discreta abaixo da versão (nome + endereço do estabelecimento). */
  establishment?: string;
}

export function ScreenManagerProfile({
  dark,
  managerName = 'Renata Albuquerque',
  managerInitials,
  managerColor = '#7A4FBE',
  shift = 'Turno da noite (17h–02h)',
  shiftStartedAt = '17:02',
  role = 'manager',
  unreadMessages = 0,
  bellBadge = 0,
  salesCentsThisShift,
  tablesServedThisShift,
  avgTicketCents,
  appVersion = '1.1.0',
  buildDate = '2026-05-06',
  establishment,
}: ScreenManagerProfileProps) {
  const C = useG(!!dark);
  const router = useRouter();
  const isOwner = role === 'owner';
  const initials =
    managerInitials ??
    managerName.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  // Round 18 (Onda 2A): stub feedback pra ActionRows sem backend ainda.
  // Antes 9 de 13 rows não tinham onClick — clique silencioso. Agora
  // toast curto explica que está em desenvolvimento.
  const [stubMsg, setStubMsg] = useState<string | null>(null);
  const showStub = (action: string) => {
    setStubMsg(`${action} · em desenvolvimento (Onda 3 backend).`);
    setTimeout(() => setStubMsg(null), 2800);
  };

  const handleLogout = () => {
    try {
      window.sessionStorage.clear();
      window.localStorage.removeItem('staffId');
      window.localStorage.removeItem('staffRole');
    } catch {
      /* ignore */
    }
    router.push('/');
  };

  // Helpers de formatação BRL.
  const fmtCents = (c?: number) =>
    c == null
      ? null
      : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(c / 100);

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: C.surface,
        fontFamily: G_FONT,
        color: C.ink,
      }}
    >
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 80 }}>
        {/* TopBar minimal — Eu é aba, não sub-tela. Só título + bell */}
        <div
          style={{
            padding: '14px 16px 12px',
            background: C.surface,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <h1 style={{ flex: 1, margin: 0, fontSize: 18, fontWeight: 700, color: C.ink, letterSpacing: -0.2 }}>Eu</h1>
          <GIconBtn
            dark={dark}
            icon={Icon.bell(20)}
            badge={bellBadge > 0 ? bellBadge : undefined}
            onClick={() => router.push('/manager/notifications')}
            ariaLabel="Notificações"
          />
        </div>

        {/* 1 · HERO — avatar lado-a-lado · pulse "em turno desde HH:MM" */}
        <div
          style={{
            padding: '20px 16px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            borderBottom: `1px solid ${C.borderSoft}`,
            background: C.bg,
          }}
        >
          <MAvatar name={managerName} init={initials} color={managerColor} size={76} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.ink, letterSpacing: -0.3 }}>{managerName}</div>
            <div style={{ fontSize: 12, color: C.faint, marginTop: 3, fontWeight: 600 }}>
              {isOwner ? 'Dona' : 'Gerente'} · {shift}
            </div>
            <div
              style={{
                fontSize: 11,
                color: '#1E8C5A',
                marginTop: 6,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                letterSpacing: 0.3,
                textTransform: 'uppercase',
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: '#1E8C5A',
                  animation: 'gPulse 2s infinite',
                }}
              />
              em turno desde {shiftStartedAt}
            </div>
          </div>
        </div>

        {/* 2 · MENSAGENS · V11 · bloco próprio (interruptivo · acima do KPI) */}
        <MSection dark={dark} title="Mensagens">
          <div style={{ padding: '0 16px' }}>
            <ActionRow
              dark={dark}
              icon={Icon.chat(18)}
              lbl="Mensagens"
              sub={
                unreadMessages > 0
                  ? `Histórico · ${unreadMessages} não-${unreadMessages === 1 ? 'lida' : 'lidas'}`
                  : 'Histórico'
              }
              badge={unreadMessages > 0 ? unreadMessages : undefined}
              onClick={() => router.push('/manager/mensagens')}
            />
          </div>
        </MSection>

        {/* 3 · KPI · Vendas no seu turno (passa quando dado disponível) */}
        {salesCentsThisShift != null && (
          <div style={{ padding: '14px 16px 0' }}>
            <div
              style={{
                padding: 14,
                borderRadius: 12,
                background: C.bg,
                border: `1px solid ${C.borderSoft}`,
              }}
            >
              <div style={{ fontSize: 11, color: C.faint, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                Vendas no SEU turno
              </div>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 800,
                  color: C.ink,
                  letterSpacing: -0.6,
                  marginTop: 4,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {fmtCents(salesCentsThisShift)}
              </div>
              {tablesServedThisShift != null && (
                <div style={{ fontSize: 11.5, color: '#1E8C5A', marginTop: 4, fontWeight: 700 }}>
                  ↑ {tablesServedThisShift} mesas atendidas
                  {avgTicketCents != null && ` · ticket médio ${fmtCents(avgTicketCents)}`}
                </div>
              )}
              <div style={{ fontSize: 10.5, color: C.faint, marginTop: 6, fontWeight: 400, lineHeight: 1.4 }}>
                Só o que entrou desde que você abriu o turno ({shiftStartedAt}). Veja o dia inteiro no Financeiro.
              </div>
            </div>
          </div>
        )}

        {/* 4 · OPERAÇÃO · Encerrar turno destacado mostarda + 3 acessos */}
        <MSection dark={dark} title="Operação">
          <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              type="button"
              onClick={() => showStub('Encerrar turno')}
              style={{
                all: 'unset',
                cursor: 'pointer',
                width: '100%',
                boxSizing: 'border-box',
                padding: '14px 16px',
                borderRadius: 12,
                background: '#FFF7E6',
                border: '1px solid #F0DCB6',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: '#9A7212',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {Icon.pause(18)}
              </div>
              <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#1d1c19', letterSpacing: -0.2 }}>
                  Encerrar turno
                </div>
                <div style={{ fontSize: 11.5, color: '#9A7212', marginTop: 2, fontWeight: 600 }}>
                  Vai gerar resumo · você sai do app
                </div>
              </div>
              <div style={{ color: '#9A7212', opacity: 0.7, flexShrink: 0 }}>{Icon.arrow(16)}</div>
            </button>

            <ActionRow
              dark={dark}
              icon={Icon.list(18)}
              lbl="Histórico de turnos"
              sub="Vendas, mesas e desempenho dos turnos passados"
              onClick={() => showStub('Histórico de turnos')}
            />
            <ActionRow
              dark={dark}
              icon={Icon.user(18)}
              lbl="Equipe e turnos"
              sub="Mesma tela da aba Equipe · turnos do dia inclusos"
              onClick={() => router.push('/manager/equipe')}
            />
            <ActionRow
              dark={dark}
              icon={Icon.gift(18)}
              lbl="Cortesias"
              sub="Histórico · criar manualmente"
              onClick={() => router.push('/manager/cortesias')}
            />
          </div>
        </MSection>

        {/* 5 · CONTA */}
        <MSection dark={dark} title="Conta">
          <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <ActionRow
              dark={dark}
              icon={Icon.bell(18)}
              lbl="Notificações"
              sub="Avisos do turno · push · sons · lock screen"
              onClick={() => showStub('Notificações')}
            />
            <ActionRow
              dark={dark}
              icon={Icon.shield(18)}
              lbl="Segurança e senha"
              sub="Trocar senha · 2FA · sessões ativas"
              onClick={() => showStub('Segurança e senha')}
            />
            <ActionRow
              dark={dark}
              icon={Icon.flame(18)}
              lbl="Aparência"
              sub="Modo claro · escuro · automático"
              onClick={() => showStub('Aparência')}
            />
          </div>
        </MSection>

        {/* 6 · ESTABELECIMENTO · só owners */}
        {isOwner && (
          <MSection dark={dark} title="Estabelecimento · só donos">
            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <ActionRow
                dark={dark}
                icon={Icon.table(18)}
                lbl="Configuração de mesas"
                sub="Número, capacidade, setores · imprimir QR codes"
                onClick={() => showStub('Configuração de mesas')}
              />
              <ActionRow
                dark={dark}
                icon={Icon.clock(18)}
                lbl="Horários do restaurante"
                sub="Abertura, fechamento, dias da semana"
                onClick={() => showStub('Horários do restaurante')}
              />
              <ActionRow
                dark={dark}
                icon={Icon.list(18)}
                lbl="Cardápio"
                sub="Editar pratos, preços, fotos, categorias"
                onClick={() => showStub('Cardápio')}
              />
              <ActionRow
                dark={dark}
                icon={Icon.receipt(18)}
                lbl="Plano e cobrança"
                sub="Plano atual · histórico · método de pagamento"
                onClick={() => showStub('Plano e cobrança')}
              />
            </div>
          </MSection>
        )}

        {/* 7 · SAIR · destrutivo · brick */}
        <div style={{ padding: '24px 16px 16px' }}>
          <button
            type="button"
            onClick={handleLogout}
            style={{
              all: 'unset',
              cursor: 'pointer',
              width: '100%',
              boxSizing: 'border-box',
              padding: '14px 16px',
              borderRadius: 12,
              border: '1px solid #F4C7C7',
              background: '#FFF1F1',
              color: '#A12626',
              fontSize: 14,
              fontWeight: 700,
              textAlign: 'center',
            }}
          >
            Sair do app
          </button>
          <div style={{ fontSize: 10.5, color: C.faint, textAlign: 'center', marginTop: 10, lineHeight: 1.5 }}>
            Versão {appVersion} · build {buildDate}
            {establishment && (
              <>
                <br />
                {establishment}
              </>
            )}
          </div>
        </div>
      </div>

      <MBottomNav active="me" dark={dark} onTo={(r) => router.push(r)} />

      {stubMsg && (
        <div
          role="status"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 90,
            transform: 'translateX(-50%)',
            zIndex: 80,
            padding: '12px 18px',
            borderRadius: 999,
            background: C.ink,
            color: C.bg,
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: -0.1,
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            maxWidth: 'calc(100vw - 32px)',
            textAlign: 'center',
          }}
        >
          {stubMsg}
        </div>
      )}

      {/* Pulse keyframe — usado pelo dot "em turno desde …". CSS inline no
          framework não tolera @keyframes; injetamos via styled-jsx. */}
      <style jsx global>{`
        @keyframes gPulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.4;
          }
        }
      `}</style>
    </div>
  );
}

// ─── ActionRow — linha clicável com ícone + label + sub + badge + arrow.
// Usada em Mensagens · Operação · Conta · Estabelecimento.
function ActionRow({
  icon,
  lbl,
  sub,
  badge,
  onClick,
  danger,
  accent,
  dark,
}: {
  icon: ReactNode;
  lbl: string;
  sub?: string;
  badge?: number;
  onClick?: () => void;
  danger?: boolean;
  accent?: boolean;
  dark?: boolean;
}) {
  const C = useG(!!dark);
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        all: 'unset',
        cursor: onClick ? 'pointer' : 'default',
        width: '100%',
        boxSizing: 'border-box',
        padding: '12px 14px',
        borderRadius: 12,
        border: `1px solid ${C.borderSoft}`,
        background: C.bg,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: danger ? '#FFE9E9' : accent ? '#F0E8D8' : '#F4F0E8',
          color: danger ? '#A12626' : accent ? '#7A4D10' : C.ink,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: danger ? '#A12626' : C.ink, letterSpacing: -0.1 }}>
          {lbl}
        </div>
        {sub && (
          <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2, fontWeight: 500, lineHeight: 1.3 }}>
            {sub}
          </div>
        )}
      </div>
      {badge != null && badge > 0 && (
        <span
          style={{
            minWidth: 22,
            height: 22,
            padding: '0 7px',
            borderRadius: 11,
            background: '#C43A3A',
            color: '#fff',
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: 0.2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontVariantNumeric: 'tabular-nums',
            flexShrink: 0,
          }}
        >
          {badge}
        </span>
      )}
      <div style={{ color: C.faint, opacity: 0.5, flexShrink: 0 }}>{Icon.arrow(16)}</div>
    </button>
  );
}

export default ScreenManagerProfile;
