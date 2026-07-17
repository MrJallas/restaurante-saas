import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import type { OrdersService } from './orders.service';
import type { CallerResolverService } from '../../common/services/caller-resolver.service';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const STAFF_ID = '22222222-2222-4222-8222-222222222222';

function harness(role: string) {
  const updateStatus = jest.fn(async () => ({ ok: true }));
  const advanceStationItems = jest.fn(async () => ({ ok: true }));
  const resolver = {
    requireActiveStaffIdentity: jest.fn(async () => ({ staffId: STAFF_ID, role })),
  } as unknown as CallerResolverService;
  const controller = new OrdersController(
    { updateStatus, advanceStationItems } as unknown as OrdersService,
    resolver,
  );
  return { controller, updateStatus, advanceStationItems };
}

function staffReq(): never {
  return {
    headers: {},
    actorType: 'staff',
    staffAuth: { staffId: STAFF_ID },
  } as never;
}

describe('OrdersController.updateStatus — papel e autoria', () => {
  it('cashier não cancela pedido e não chega ao service', async () => {
    const ctx = harness('cashier');
    await expect(
      ctx.controller.updateStatus(
        ORDER_ID,
        'demo',
        { status: 'cancelled', changedBy: 'uuid-owner' },
        staffReq(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(ctx.updateStatus).not.toHaveBeenCalled();
  });

  it('waiter entrega com seu UUID canônico, ignorando changedBy do body', async () => {
    const ctx = harness('waiter');
    await ctx.controller.updateStatus(
      ORDER_ID,
      'demo',
      { status: 'delivered', changedBy: 'uuid-owner' },
      staffReq(),
    );
    expect(ctx.updateStatus).toHaveBeenCalledWith(
      ORDER_ID,
      'delivered',
      STAFF_ID,
      'demo',
      expect.objectContaining({ staffId: STAFF_ID, staffRole: 'waiter' }),
    );
  });

  it('TV sem pessoa só avança preparo com principal explícito da estação', async () => {
    const ctx = harness('irrelevant');
    const tvReq = { headers: {}, actorType: 'staff' as const } as never;
    await ctx.controller.updateStatus(
      ORDER_ID,
      'demo',
      { status: 'ready', station: 'kitchen', changedBy: 'uuid-owner' },
      tvReq,
    );
    expect(ctx.advanceStationItems).toHaveBeenCalledWith(
      ORDER_ID,
      'kitchen',
      'ready',
      'station:kitchen',
      'demo',
      expect.objectContaining({ station: 'kitchen' }),
    );

    await expect(
      ctx.controller.updateStatus(
        ORDER_ID,
        'demo',
        { status: 'cancelled', changedBy: 'uuid-owner' },
        tvReq,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('cook legado sem station é limitado server-side à cozinha', async () => {
    const ctx = harness('cook');
    await ctx.controller.updateStatus(
      ORDER_ID,
      'demo',
      { status: 'in_progress', changedBy: 'cozinha-legada' },
      staffReq(),
    );
    expect(ctx.advanceStationItems).toHaveBeenCalledWith(
      ORDER_ID,
      'kitchen',
      'in_progress',
      STAFF_ID,
      'demo',
      expect.objectContaining({ station: 'kitchen', staffRole: 'cook' }),
    );
    expect(ctx.updateStatus).not.toHaveBeenCalled();
  });

  it('manager legado sem station avança todos os itens, nunca só orders.status', async () => {
    const ctx = harness('manager');
    await ctx.controller.updateStatus(
      ORDER_ID,
      'demo',
      { status: 'ready', changedBy: 'manager-legado' },
      staffReq(),
    );
    expect(ctx.advanceStationItems).toHaveBeenCalledWith(
      ORDER_ID,
      null,
      'ready',
      STAFF_ID,
      'demo',
      expect.objectContaining({ station: null, staffRole: 'manager' }),
    );
    expect(ctx.updateStatus).not.toHaveBeenCalled();
  });

  it('customer nunca controla changedBy', async () => {
    const ctx = harness('irrelevant');
    const req = {
      headers: {},
      actorType: 'session' as const,
      sessionData: { sessionId: 'session-1' },
    } as never;
    await ctx.controller.updateStatus(
      ORDER_ID,
      'demo',
      { status: 'cancelled', changedBy: 'uuid-owner' },
      req,
    );
    expect(ctx.updateStatus).toHaveBeenCalledWith(
      ORDER_ID,
      'cancelled',
      'customer',
      'demo',
      expect.objectContaining({ actorType: 'session' }),
    );
  });
});
