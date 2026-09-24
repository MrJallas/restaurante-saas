import { UnauthorizedException } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import type { OrdersService } from './orders.service';
import type { CallerResolverService } from '../../common/services/caller-resolver.service';

/**
 * Atribuição do "Chamar garçom" da cozinha/bar (`order_deliveries.called_by`).
 * A TV é estação sem pessoa (called_by NULL); o KDS individual (/bar, /cozinha
 * com login) tem token e atribui a quem clicou. Antes a atribuição dependia só
 * do header `x-staff-id`, que o proxy repassava do browser — sem ele, um
 * cozinheiro logado virava "chamado pela estação".
 */

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const STAFF_ID = '22222222-2222-4222-8222-222222222222';

function harness(resolve: () => Promise<string> = async () => STAFF_ID) {
  const callWaiterForOrder = jest.fn(async () => ({ ok: true }));
  const requireActiveStaffId = jest.fn(resolve);
  const controller = new OrdersController(
    { callWaiterForOrder } as unknown as OrdersService,
    { requireActiveStaffId } as unknown as CallerResolverService,
  );
  return { controller, callWaiterForOrder, requireActiveStaffId };
}

describe('OrdersController.callWaiter — atribuição', () => {
  it('TV (só a key, sem token e sem header) → chamada da estação, called_by NULL', async () => {
    const ctx = harness();
    await ctx.controller.callWaiter(ORDER_ID, 'demo', { headers: {} } as never);

    expect(ctx.requireActiveStaffId).not.toHaveBeenCalled();
    expect(ctx.callWaiterForOrder).toHaveBeenCalledWith(ORDER_ID, 'demo', null);
  });

  it('token verificado sem header → atribui ao staff do token', async () => {
    const ctx = harness();
    await ctx.controller.callWaiter(ORDER_ID, 'demo', {
      headers: {},
      staffAuth: { staffId: STAFF_ID },
    } as never);

    expect(ctx.requireActiveStaffId).toHaveBeenCalledTimes(1);
    expect(ctx.callWaiterForOrder).toHaveBeenCalledWith(ORDER_ID, 'demo', STAFF_ID);
  });

  it('header sem token que o resolver recusa (forjado, demitido ou token obrigatório) → 401', async () => {
    const ctx = harness(async () => {
      throw new UnauthorizedException();
    });

    await expect(
      ctx.controller.callWaiter(ORDER_ID, 'demo', {
        headers: { 'x-staff-id': STAFF_ID },
      } as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(ctx.callWaiterForOrder).not.toHaveBeenCalled();
  });
});
