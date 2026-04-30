'use client';

import { useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useSession } from '../../../../hooks/useSession';
import { useNav } from '../../../../hooks/useNav';
import { AppShell } from '../../../../components/layout/AppShell';
import { PillButton } from '../../../../components/ui/PillButton';
import { Row } from '../../../../components/ui/Row';

const REASON_CODES: Record<string, { code: string; title: string; body: string; motive: string }> = {
  expired: {
    code: 'E-104',
    title: 'Algo deu errado com seu Pix',
    body: 'Seu banco não respondeu a tempo. Sua conta não foi debitada — você pode tentar novamente agora.',
    motive: 'tempo de expiração do QR Code. Gere um novo código ou tente outra forma de pagamento.',
  },
  failed: {
    code: 'E-102',
    title: 'Transação recusada',
    body: 'Seu banco recusou a transação. Sua conta não foi debitada — você pode tentar novamente agora.',
    motive: 'recusa do banco emissor. Confira o saldo ou tente outra forma de pagamento.',
  },
  method_unavailable: {
    code: 'E-210',
    title: 'Forma de pagamento indisponível',
    body: 'Esta forma de pagamento ainda não está ativa no restaurante. Use o Pix ou chame o garçom.',
    motive: 'integração pendente. Pague via Pix ou chame o garçom para pagamento presencial.',
  },
  gateway: {
    code: 'E-500',
    title: 'Problema na comunicação',
    body: 'Não conseguimos falar com a maquininha agora. Sua conta não foi debitada.',
    motive: 'falha temporária no gateway. Tente novamente em alguns segundos.',
  },
};

interface AltOption {
  label: string;
  sub: string;
  href?: string;
}

export default function PagamentoErroPage() {
  const params = useParams();
  const router = useRouter();
  const { push } = useNav();
  const searchParams = useSearchParams();
  const { tableLabel } = useSession();
  const slug = params.slug as string;
  const reason = searchParams.get('reason') ?? 'failed';
  const amountParam = searchParams.get('amount');

  const data = REASON_CODES[reason] ?? REASON_CODES.failed;
  const now = useMemo(() => {
    const d = new Date();
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }, []);
  const amount = amountParam ? `R$ ${(Number(amountParam) / 100).toFixed(2).replace('.', ',')}` : '—';

  const alternatives: AltOption[] = [
    { label: 'Cartão de crédito', sub: 'Visa, Master, Elo' },
    { label: 'Cartão de débito', sub: 'Débito em conta' },
    { label: 'Pedir ajuda ao garçom', sub: 'Pagamento presencial', href: `/${slug}/garcom/chamar` },
  ];

  return (
    <AppShell
      slug={slug}
      restaurantName=""
      tableLabel={tableLabel || ''}
      activeHref={`/${slug}/pagamento`}
      noMainPadding
      onBack={() => push(`/${slug}/pagamento`)}
    >
      <div className="flex flex-1 flex-col overflow-auto px-6 py-5">
        <div className="flex flex-col items-center pb-5 pt-3.5">
          <div className="mb-[18px] flex h-[76px] w-[76px] items-center justify-center rounded-full border-2 border-danger text-[36px] text-danger">
            !
          </div>
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[2px] text-danger">
            Pagamento não autorizado
          </div>
          <div className="mb-2.5 text-center text-[24px] font-semibold leading-[1.2] tracking-[-0.02em] text-pretty">
            {data.title}
          </div>
          <div className="mx-auto max-w-[280px] text-center text-[13px] leading-[1.5] text-mute text-pretty">
            {data.body}
          </div>
        </div>

        <div className="mb-4 rounded-[14px] border-[1.3px] border-border-soft p-4">
          <div className="mb-2.5 text-[10px] font-semibold uppercase tracking-[1px] text-mute">
            Detalhes do erro
          </div>
          <Row label="Código" value={data.code} />
          <Row label="Horário" value={now} />
          <Row label="Valor tentado" value={amount} />
          <Row label="Mesa" value={tableLabel || '—'} />
        </div>

        <div className="mb-4 rounded-[12px] border border-[#f3d5d5] bg-[#fdf2f2] p-3.5">
          <div className="text-[12px] leading-[1.5] text-[#7a1f1f] text-pretty">
            <b>Motivo provável:</b> {data.motive}
          </div>
        </div>

        <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[1.5px] text-mute">
          Outras opções
        </div>
        <div className="mb-3.5 flex flex-col gap-2">
          {alternatives.map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() => o.href && push(o.href)}
              className="flex items-center gap-2.5 rounded-[12px] border-[1.2px] border-border-soft px-3.5 py-3 text-left"
            >
              <div className="flex-1">
                <div className="text-[14px] font-medium">{o.label}</div>
                <div className="text-[11px] text-mute">{o.sub}</div>
              </div>
              <div className="text-[14px] text-faint">›</div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 gap-2.5 px-[22px] pb-safe pb-6 pt-2.5">
        <PillButton onClick={() => router.back()} className="flex-1">
          Voltar
        </PillButton>
        <PillButton
          variant="filled"
          onClick={() => push(`/${slug}/pagamento`)}
          className="flex-[2]"
        >
          Tentar Pix novamente
        </PillButton>
      </div>
    </AppShell>
  );
}
