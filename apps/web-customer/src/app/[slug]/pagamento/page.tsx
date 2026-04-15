'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Users, User, CreditCard, QrCode, Banknote, Copy, Check, Star, Send } from 'lucide-react';
import { apiGet, apiPost } from '../../../lib/api';
import { useSession } from '../../../hooks/useSession';
import { AppShell } from '../../../components/layout/AppShell';
import { formatCents } from '../../../lib/format';

interface BillData {
  mode: string;
  totalCents: number;
  orderCount: number;
  orders: {
    id: string;
    billing_mode: string;
    total_cents: number;
    status: string;
    items: { name: string; quantity: number; subtotalCents: number }[];
  }[];
}

interface PaymentData {
  paymentId: string;
  status: string;
  amountCents: number;
  pixQrCode: string;
  pixCopyPaste: string;
}

type PageView = 'bill' | 'payment' | 'feedback' | 'done';

export default function PagamentoPage() {
  const params = useParams();
  const session = useSession();
  const slug = params.slug as string;

  const [view, setView] = useState<PageView>('bill');
  const [tableBill, setTableBill] = useState<BillData | null>(null);
  const [individualBill, setIndividualBill] = useState<BillData | null>(null);
  const [selectedMode, setSelectedMode] = useState<'table' | 'individual'>('table');
  const [payment, setPayment] = useState<PaymentData | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  // Feedback state
  const [overallRating, setOverallRating] = useState(0);
  const [foodRating, setFoodRating] = useState(0);
  const [serviceRating, setServiceRating] = useState(0);
  const [comment, setComment] = useState('');
  const [, setFeedbackSent] = useState(false);

  useEffect(() => {
    if (!slug) return;
    const load = async () => {
      try {
        const [tableRes, indRes] = await Promise.all([
          apiGet<BillData>(`/${slug}/orders/bill?mode=table`),
          session.visitId
            ? apiGet<BillData>(`/${slug}/orders/bill?mode=individual&visitId=${session.visitId}`)
            : Promise.resolve(null),
        ]);
        setTableBill(tableRes);
        if (indRes) setIndividualBill(indRes);
      } catch {
        // handled
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [slug, session.visitId]);

  const handleRequestPayment = async (method: string) => {
    try {
      const bill = selectedMode === 'table' ? tableBill : individualBill;
      if (!bill || bill.totalCents <= 0) return;

      const res = await apiPost<PaymentData>(`/${slug}/payments`, {
        mode: selectedMode,
        visitId: selectedMode === 'individual' ? session.visitId : undefined,
        method,
      });
      setPayment(res);
      setView('payment');
    } catch {
      // error
    }
  };

  const handleCopyPix = () => {
    if (payment?.pixCopyPaste) {
      navigator.clipboard.writeText(payment.pixCopyPaste);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSubmitFeedback = async () => {
    if (overallRating === 0 || !session.visitId) return;
    try {
      await apiPost(`/${slug}/feedbacks`, {
        visitId: session.visitId,
        customerId: session.customerId || undefined,
        overallRating,
        foodRating: foodRating || undefined,
        serviceRating: serviceRating || undefined,
        comment: comment || undefined,
      });
      setFeedbackSent(true);
      setView('done');
    } catch {
      setFeedbackSent(true);
      setView('done');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-primary">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <AppShell slug={slug} restaurantName="" logoUrl={null} tableLabel={session.tableLabel || ''}>
      {view === 'bill' && (
        <div className="space-y-4">
          <h1 className="font-hero text-xl font-bold text-white">Conta</h1>

          {/* Mode tabs */}
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedMode('table')}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium transition-colors ${
                selectedMode === 'table'
                  ? 'bg-accent text-white'
                  : 'bg-white/10 text-white/50'
              }`}
            >
              <Users className="h-4 w-4" /> Conta da mesa
            </button>
            {individualBill && (
              <button
                onClick={() => setSelectedMode('individual')}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium transition-colors ${
                  selectedMode === 'individual'
                    ? 'bg-accent text-white'
                    : 'bg-white/10 text-white/50'
                }`}
              >
                <User className="h-4 w-4" /> Minha conta
              </button>
            )}
          </div>

          {/* Bill items */}
          {(() => {
            const bill = selectedMode === 'table' ? tableBill : individualBill;
            if (!bill) return null;

            return (
              <div className="space-y-3">
                {bill.orders.map((order) => (
                  <div key={order.id} className="rounded-xl bg-white/5 p-3">
                    {order.items.map((item, i) => (
                      <div key={i} className="flex justify-between py-1">
                        <span className="text-sm text-white/70">
                          {item.quantity}x {item.name}
                        </span>
                        <span className="text-sm text-white/50">
                          {formatCents(item.subtotalCents)}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}

                {/* Total */}
                <div className="rounded-xl bg-accent/10 p-4 text-center">
                  <span className="text-sm text-white/50">Total</span>
                  <p className="font-hero text-2xl font-bold text-accent">
                    {formatCents(bill.totalCents)}
                  </p>
                </div>

                {/* Payment methods */}
                {bill.totalCents > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-white/80">Forma de pagamento</h3>
                    <button
                      onClick={() => handleRequestPayment('pix')}
                      className="flex w-full items-center gap-3 rounded-xl bg-white/5 p-4 text-left transition-colors hover:bg-white/10"
                    >
                      <QrCode className="h-6 w-6 text-green-400" />
                      <div>
                        <span className="font-medium text-white">PIX</span>
                        <p className="text-xs text-white/40">Pagamento instantaneo</p>
                      </div>
                    </button>
                    <button
                      onClick={() => handleRequestPayment('card')}
                      className="flex w-full items-center gap-3 rounded-xl bg-white/5 p-4 text-left transition-colors hover:bg-white/10"
                    >
                      <CreditCard className="h-6 w-6 text-blue-400" />
                      <div>
                        <span className="font-medium text-white">Cartao</span>
                        <p className="text-xs text-white/40">Debito ou credito</p>
                      </div>
                    </button>
                    <button
                      onClick={() => handleRequestPayment('cash')}
                      className="flex w-full items-center gap-3 rounded-xl bg-white/5 p-4 text-left transition-colors hover:bg-white/10"
                    >
                      <Banknote className="h-6 w-6 text-yellow-400" />
                      <div>
                        <span className="font-medium text-white">Dinheiro</span>
                        <p className="text-xs text-white/40">Pagamento no caixa</p>
                      </div>
                    </button>
                  </div>
                )}

                {bill.totalCents === 0 && (
                  <div className="py-8 text-center text-sm text-white/40">
                    Nenhum valor pendente.
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {view === 'payment' && payment && (
        <div className="space-y-4">
          <h1 className="font-hero text-xl font-bold text-white">Pagamento</h1>

          <div className="rounded-xl bg-accent/10 p-6 text-center">
            <p className="text-sm text-white/50">Valor</p>
            <p className="font-hero text-3xl font-bold text-accent">
              {formatCents(payment.amountCents)}
            </p>
          </div>

          {payment.pixCopyPaste && (
            <div className="space-y-3">
              <div className="flex items-center justify-center rounded-xl bg-white p-6">
                <QrCode className="h-32 w-32 text-gray-800" />
              </div>

              <button
                onClick={handleCopyPix}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 py-3 text-sm text-white/70 transition-colors hover:bg-white/20"
              >
                {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copiado!' : 'Copiar codigo PIX'}
              </button>
            </div>
          )}

          <p className="text-center text-xs text-white/30">
            Aguardando confirmacao do pagamento...
          </p>

          <button
            onClick={() => setView('feedback')}
            className="w-full rounded-xl bg-accent py-3 text-center font-medium text-white"
          >
            Ja paguei — avaliar experiencia
          </button>
        </div>
      )}

      {view === 'feedback' && (
        <div className="space-y-5">
          <h1 className="font-hero text-xl font-bold text-white">Avaliacao</h1>
          <p className="text-sm text-white/50">Como foi sua experiencia?</p>

          {/* Overall rating */}
          <div>
            <span className="text-sm text-white/70">Experiencia geral</span>
            <div className="mt-1 flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setOverallRating(n)}
                  className="transition-transform hover:scale-110"
                >
                  <Star
                    className={`h-8 w-8 ${
                      n <= overallRating ? 'fill-yellow-400 text-yellow-400' : 'text-white/20'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Food rating */}
          <div>
            <span className="text-sm text-white/70">Comida</span>
            <div className="mt-1 flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setFoodRating(n)}>
                  <Star
                    className={`h-6 w-6 ${
                      n <= foodRating ? 'fill-yellow-400 text-yellow-400' : 'text-white/20'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Service rating */}
          <div>
            <span className="text-sm text-white/70">Atendimento</span>
            <div className="mt-1 flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setServiceRating(n)}>
                  <Star
                    className={`h-6 w-6 ${
                      n <= serviceRating ? 'fill-yellow-400 text-yellow-400' : 'text-white/20'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Comment */}
          <div>
            <span className="text-sm text-white/70">Comentario (opcional)</span>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Conte-nos mais sobre sua experiencia..."
              rows={3}
              className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-accent/50 focus:outline-none"
            />
          </div>

          <button
            onClick={handleSubmitFeedback}
            disabled={overallRating === 0}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 font-medium text-white disabled:opacity-30"
          >
            <Send className="h-4 w-4" /> Enviar avaliacao
          </button>
        </div>
      )}

      {view === 'done' && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="text-5xl">🎉</div>
          <h2 className="mt-4 font-hero text-xl font-bold text-white">Obrigado!</h2>
          <p className="mt-2 text-sm text-white/50">
            Esperamos que tenha gostado. Volte sempre!
          </p>
        </div>
      )}
    </AppShell>
  );
}
