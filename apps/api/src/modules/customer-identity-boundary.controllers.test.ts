import type { Request } from 'express';
import type { SessionData } from '../common/guards/session.guard';
import type { CallerResolverService } from '../common/services/caller-resolver.service';
import { ChatHistoryController } from './chat-history/chat-history.controller';
import type { ChatHistoryService } from './chat-history/chat-history.service';
import { HomeController } from './home/home.controller';
import type { HomeService } from './home/home.service';
import { CustomerCourtesiesController } from './courtesies/courtesies.controller';
import type { CourtesiesService } from './courtesies/courtesies.service';
import { CustomerEventsController } from './customer-events/customer-events.controller';
import type { CustomerEventsService } from './customer-events/customer-events.service';
import type { TenantRequest } from './tenant/tenant.middleware';

const COOKIE_CUSTOMER = '11111111-1111-4111-8111-111111111111';
const SHARED_SESSION_CUSTOMER = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';

const session: SessionData = {
  sessionId: SESSION_ID,
  tableId: '44444444-4444-4444-8444-444444444444',
  tableCode: 'QR1',
  tableLabel: 'Mesa 1',
  schemaName: 'restaurant_dev',
  // Este valor vive no token Redis compartilhado da mesa e pode ter sido
  // sobrescrito pelo último participante que fez welcome. Nunca é identidade.
  customerId: SHARED_SESSION_CUSTOMER,
};

function request(): Request {
  return { headers: {}, cookies: {} } as unknown as Request;
}

function resolver(overrides: Partial<CallerResolverService> = {}): CallerResolverService {
  return {
    requireCustomerId: jest.fn(async () => COOKIE_CUSTOMER),
    tryGetCustomerId: jest.fn(async () => COOKIE_CUSTOMER),
    ...overrides,
  } as unknown as CallerResolverService;
}

describe('fronteira de identidade individual — recognition_token vence sessão de mesa', () => {
  it('chat-history falha fechado quando o resolver não reconhece o caller, mesmo com customerId na sessão', async () => {
    const service = { listThreads: jest.fn() } as unknown as ChatHistoryService;
    const authError = new Error('recognition_token ausente');
    const caller = resolver({
      requireCustomerId: jest.fn(async () => Promise.reject(authError)),
    });
    const controller = new ChatHistoryController(service, caller as never);

    await expect(controller.listThreads(request(), 'restaurant_dev', session)).rejects.toBe(
      authError,
    );
    expect(service.listThreads).not.toHaveBeenCalled();
  });

  it('chat-history lista e apaga somente para o customer resolvido pelo cookie', async () => {
    const service = {
      listThreads: jest.fn(async () => []),
      deleteAllForCustomer: jest.fn(async () => ({ ok: true })),
    } as unknown as ChatHistoryService;
    const caller = resolver();
    const controller = new ChatHistoryController(service, caller as never);

    await controller.listThreads(request(), 'restaurant_dev', session);
    await controller.deleteAll(request(), session, 'restaurant_dev');

    expect(service.listThreads).toHaveBeenCalledWith(COOKIE_CUSTOMER, 'restaurant_dev');
    expect(service.deleteAllForCustomer).toHaveBeenCalledWith(COOKIE_CUSTOMER, 'restaurant_dev');
    expect(caller.requireCustomerId).toHaveBeenCalledTimes(2);
  });

  it('home sem recognition_token permanece anônima e nunca consulta PII da identidade compartilhada', async () => {
    const service = { getHome: jest.fn(async () => ({})) } as unknown as HomeService;
    const caller = resolver({ tryGetCustomerId: jest.fn(async () => null) });
    const controller = new HomeController(service, caller);
    const req = { headers: {} } as TenantRequest;

    await controller.getHome(session, req);

    expect(service.getHome).toHaveBeenCalledWith(
      SESSION_ID,
      undefined,
      'Mesa 1',
      expect.any(Object),
    );
  });

  it('cortesia ativa pode ser lida anonimamente, mas não cria histórico para a identidade da sessão', async () => {
    const service = { listForSession: jest.fn(async () => []) } as unknown as CourtesiesService;
    const caller = resolver({ tryGetCustomerId: jest.fn(async () => null) });
    const Controller = CustomerCourtesiesController as unknown as new (
      service: CourtesiesService,
      caller: CallerResolverService,
    ) => CustomerCourtesiesController;
    const controller = new Controller(service, caller);

    await controller.list(session, request());

    expect(service.listForSession).toHaveBeenCalledWith(SESSION_ID, null);
  });

  it('histórico de cortesias falha fechado e usa apenas recognition_token', async () => {
    const service = {
      listHistoryForCustomer: jest.fn(async () => []),
    } as unknown as CourtesiesService;
    const caller = resolver();
    const Controller = CustomerCourtesiesController as unknown as new (
      service: CourtesiesService,
      caller: CallerResolverService,
    ) => CustomerCourtesiesController;
    const controller = new Controller(service, caller);

    await controller.history(session, request());

    expect(service.listHistoryForCustomer).toHaveBeenCalledWith(COOKIE_CUSTOMER, SESSION_ID);
    expect(caller.requireCustomerId).toHaveBeenCalledTimes(1);
  });

  it('histórico de cortesias não degrada para [] nem para customerId da mesa sem cookie', async () => {
    const service = {
      listHistoryForCustomer: jest.fn(async () => []),
    } as unknown as CourtesiesService;
    const authError = new Error('recognition_token ausente');
    const caller = resolver({
      requireCustomerId: jest.fn(async () => Promise.reject(authError)),
    });
    const Controller = CustomerCourtesiesController as unknown as new (
      service: CourtesiesService,
      caller: CallerResolverService,
    ) => CustomerCourtesiesController;
    const controller = new Controller(service, caller);

    await expect(controller.history(session, request())).rejects.toBe(authError);
    expect(service.listHistoryForCustomer).not.toHaveBeenCalled();
  });

  it('resposta à cortesia de mesa usa identidade opcional do cookie, nunca a compartilhada', async () => {
    const service = {
      respondForSession: jest.fn(async () => ({})),
    } as unknown as CourtesiesService;
    const caller = resolver();
    const Controller = CustomerCourtesiesController as unknown as new (
      service: CourtesiesService,
      caller: CallerResolverService,
    ) => CustomerCourtesiesController;
    const controller = new Controller(service, caller);

    await controller.respond(
      'restaurant_dev',
      'courtesy-1',
      { status: 'aceita' },
      session,
      request(),
    );

    expect(service.respondForSession).toHaveBeenCalledWith(
      'courtesy-1',
      'aceita',
      SESSION_ID,
      'restaurant_dev',
      COOKIE_CUSTOMER,
    );
  });

  it('telemetria prioriza recognition_token e fica anônima quando ele falta', async () => {
    const service = {
      create: jest.fn(async (input) => ({ id: 'event-1', ...input })),
    } as unknown as CustomerEventsService;
    const caller = resolver();
    const controller = new CustomerEventsController(service, caller);

    await controller.create(
      'restaurant_dev',
      { event_type: 'menu_viewed', metadata: {} },
      session,
      request(),
    );
    expect(service.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ customerId: COOKIE_CUSTOMER }),
    );

    (caller.tryGetCustomerId as jest.Mock).mockResolvedValueOnce(null);
    await controller.create(
      'restaurant_dev',
      { event_type: 'assistant_opened', metadata: {} },
      session,
      request(),
    );
    expect(service.create).toHaveBeenLastCalledWith(expect.objectContaining({ customerId: null }));
  });
});
