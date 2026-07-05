/**
 * Bug P2 (re-scan 2026-07-05): a aba "Minhas mesas" do garçom nunca incluía
 * CHAMADOS — só entregas. `mapCall()` jamais setava `mine`, então um chamado
 * que ESTE garçom já aceitou (acknowledge → assigned_waiter_name = eu) não
 * aparecia no filtro `mine`.
 *
 * A audiência do chamado espelha os predicados canônicos das entregas
 * (isDeliveryForWaiter/isDeliveryClaimedBy): ownership é por IDENTIDADE. Como
 * o payload de /waiter-calls/pending expõe `assigned_waiter_name` (quem
 * aceitou) — e NÃO o UUID acknowledged_by — a única chave de identidade
 * disponível no FE é o NOME do garçom logado (staffName). Regra:
 *   - chamado 'acknowledged' cujo assigned_waiter_name == meu nome → é meu;
 *   - chamado 'pending' (ninguém aceitou ainda) → de ninguém, não é "meu";
 *   - sem identidade (staffName vazio) → nunca reivindica.
 *
 * RED: `isCallMine` não existe / `mapCall` não seta mine. GREEN: retorna
 * true só pro chamado que eu aceitei.
 */
import { isCallMine, mapCall } from './ScreenWaiterCalls';

const ackByMe = {
  id: 'c1',
  status: 'acknowledged',
  reason: 'ask_bill',
  created_at: '2026-07-05T01:00:00Z',
  table_label: 'Mesa 12',
  table_code: 'M12',
  assigned_waiter_name: 'Rodrigo',
};

const ackBySomeoneElse = {
  id: 'c2',
  status: 'acknowledged',
  reason: 'serve_drink',
  created_at: '2026-07-05T01:01:00Z',
  table_label: 'Mesa 07',
  table_code: 'M07',
  assigned_waiter_name: 'Ana',
};

const stillPending = {
  id: 'c3',
  status: 'pending',
  reason: 'bring_menu',
  created_at: '2026-07-05T01:02:00Z',
  table_label: 'Mesa 03',
  table_code: 'M03',
  assigned_waiter_name: null,
};

describe('isCallMine — ownership por identidade (nome do garçom)', () => {
  it('é meu quando eu aceitei o chamado (assigned_waiter_name == meu nome)', () => {
    expect(isCallMine(ackByMe, 'Rodrigo')).toBe(true);
  });

  it('tolera caixa/espaços no nome (Rodrigo vs  rodrigo )', () => {
    expect(isCallMine(ackByMe, '  rodrigo ')).toBe(true);
  });

  it('NÃO é meu quando outro garçom aceitou', () => {
    expect(isCallMine(ackBySomeoneElse, 'Rodrigo')).toBe(false);
  });

  it('NÃO é meu quando o chamado ainda está pending (de ninguém)', () => {
    expect(isCallMine(stillPending, 'Rodrigo')).toBe(false);
  });

  it('sem identidade (staffName vazio) nunca reivindica', () => {
    expect(isCallMine(ackByMe, '')).toBe(false);
    expect(isCallMine(ackByMe, null)).toBe(false);
  });
});

describe('mapCall — propaga mine pro filtro "Minhas mesas"', () => {
  it('marca mine=true no chamado que eu aceitei', () => {
    expect(mapCall(ackByMe, 'Rodrigo').mine).toBe(true);
  });

  it('marca mine=false no chamado de outro garçom', () => {
    expect(mapCall(ackBySomeoneElse, 'Rodrigo').mine).toBe(false);
  });

  it('marca mine=false num chamado pending', () => {
    expect(mapCall(stillPending, 'Rodrigo').mine).toBe(false);
  });
});
