/**
 * Bug P2 (re-scan 2026-07-05): a aba "Minhas mesas" do garçom nunca incluía
 * CHAMADOS — só entregas. `mapCall()` jamais setava `mine`, então um chamado
 * que ESTE garçom já aceitou (acknowledge → acknowledged_by = eu) não
 * aparecia no filtro `mine`.
 *
 * A audiência do chamado espelha os predicados canônicos das entregas
 * (isDeliveryForWaiter/isDeliveryClaimedBy): ownership é por UUID verificado,
 * nunca por nome exibido. Regra:
 *   - chamado 'acknowledged' cujo acknowledged_by == meu staffId → é meu;
 *   - chamado 'pending' (ninguém aceitou ainda) → de ninguém, não é "meu";
 *   - sem identidade (staffId vazio) → nunca reivindica.
 *
 * RED: `isCallMine` não existe / `mapCall` não seta mine. GREEN: retorna
 * true só pro chamado que eu aceitei.
 */
import { isCallMine, mapCall } from './ScreenWaiterCalls';

const STAFF_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_STAFF_ID = '22222222-2222-4222-8222-222222222222';

const ackByMe = {
  id: 'c1',
  status: 'acknowledged',
  reason: 'ask_bill',
  created_at: '2026-07-05T01:00:00Z',
  table_label: 'Mesa 12',
  table_code: 'M12',
  assigned_waiter_name: 'Rodrigo',
  acknowledged_by: STAFF_ID,
};

const ackBySomeoneElse = {
  id: 'c2',
  status: 'acknowledged',
  reason: 'serve_drink',
  created_at: '2026-07-05T01:01:00Z',
  table_label: 'Mesa 07',
  table_code: 'M07',
  // Mesmo nome de exibição prova que ownership não depende dele.
  assigned_waiter_name: 'Rodrigo',
  acknowledged_by: OTHER_STAFF_ID,
};

const stillPending = {
  id: 'c3',
  status: 'pending',
  reason: 'bring_menu',
  created_at: '2026-07-05T01:02:00Z',
  table_label: 'Mesa 03',
  table_code: 'M03',
  assigned_waiter_name: null,
  acknowledged_by: null,
};

describe('isCallMine — ownership por UUID', () => {
  it('é meu quando eu aceitei o chamado', () => {
    expect(isCallMine(ackByMe, STAFF_ID)).toBe(true);
  });

  it('NÃO é meu quando outro garçom aceitou', () => {
    expect(isCallMine(ackBySomeoneElse, STAFF_ID)).toBe(false);
  });

  it('NÃO é meu quando o chamado ainda está pending (de ninguém)', () => {
    expect(isCallMine(stillPending, STAFF_ID)).toBe(false);
  });

  it('sem identidade nunca reivindica', () => {
    expect(isCallMine(ackByMe, '')).toBe(false);
    expect(isCallMine(ackByMe, null)).toBe(false);
  });
});

describe('mapCall — propaga mine pro filtro "Minhas mesas"', () => {
  it('marca mine=true no chamado que eu aceitei', () => {
    expect(mapCall(ackByMe, STAFF_ID).mine).toBe(true);
  });

  it('marca mine=false no chamado de outro garçom', () => {
    expect(mapCall(ackBySomeoneElse, STAFF_ID).mine).toBe(false);
  });

  it('marca mine=false num chamado pending', () => {
    expect(mapCall(stillPending, STAFF_ID).mine).toBe(false);
  });
});
