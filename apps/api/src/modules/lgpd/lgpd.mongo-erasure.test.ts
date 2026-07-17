import { ChatHistoryService } from '../chat-history/chat-history.service';
import { CustomerStaffMessagesService } from '../customer-staff-messages/customer-staff-messages.service';
import type { MongoService } from '../../infra/mongo/mongo.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';

const TENANT = 'restaurant_dev';
const CUSTOMER = '11111111-1111-4111-8111-111111111111';

function fakeMongo(options: { remainingCollection?: string } = {}) {
  const calls = new Map<
    string,
    {
      deleteMany: jest.Mock;
      countDocuments: jest.Mock;
      updateMany: jest.Mock;
    }
  >();

  const collection = (name: string) => {
    if (!calls.has(name)) {
      calls.set(name, {
        deleteMany: jest.fn(async () => ({ acknowledged: true, deletedCount: 2 })),
        countDocuments: jest.fn(async () => (options.remainingCollection === name ? 1 : 0)),
        updateMany: jest.fn(async () => ({ acknowledged: true, modifiedCount: 2 })),
      });
    }
    return calls.get(name)!;
  };

  return {
    calls,
    mongo: { tryDb: () => ({ collection }) } as unknown as MongoService,
  };
}

describe('LGPD Mongo erasure — tenant scope e confirmação', () => {
  it('leituras de chat não normalizam nem consultam customerId fora do tenant', async () => {
    const find = jest.fn(() => ({
      sort: () => ({
        limit: () => ({ toArray: async () => [] }),
      }),
    }));
    const updateMany = jest.fn();
    const mongo = {
      tryDb: () => ({ collection: () => ({ find, updateMany }) }),
    } as unknown as MongoService;

    await new ChatHistoryService(mongo).listThreads(CUSTOMER, TENANT);

    expect(find).toHaveBeenCalledWith({
      customerId: CUSTOMER,
      tenantId: TENANT,
      deletedByUser: { $ne: true },
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('leitura de staff messages exige tenant+customer no thread e nas mensagens', async () => {
    const findOne = jest.fn(async () => ({
      threadId: 'thread-1',
      customerId: CUSTOMER,
      tenantId: TENANT,
    }));
    const find = jest.fn(() => ({ sort: () => ({ toArray: async () => [] }) }));
    const mongo = {
      tryDb: () => ({
        collection: (name: string) => (name === 'staff_threads' ? { findOne } : { find }),
      }),
    } as unknown as MongoService;
    const service = new CustomerStaffMessagesService(mongo, {} as TenantConnectionProvider);

    await service.getThreadMessages('thread-1', CUSTOMER, TENANT);

    expect(findOne).toHaveBeenCalledWith({
      threadId: 'thread-1',
      customerId: CUSTOMER,
      tenantId: TENANT,
    });
    expect(find).toHaveBeenCalledWith({
      threadId: 'thread-1',
      customerId: CUSTOMER,
      tenantId: TENANT,
    });
  });

  it('chat history faz hard-delete tenant-scoped e confirma ausência residual', async () => {
    const fake = fakeMongo();
    const result = await new ChatHistoryService(fake.mongo).deleteAllForCustomer(CUSTOMER, TENANT);

    expect(result).toMatchObject({ mongoAvailable: true, confirmed: true });
    expect(fake.calls.get('chat_threads')?.deleteMany).toHaveBeenCalledWith({
      tenantId: TENANT,
      customerId: CUSTOMER,
    });
    expect(fake.calls.get('chat_messages')?.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: CUSTOMER,
        $or: expect.arrayContaining([{ tenantId: TENANT }]),
      }),
    );
    expect(fake.calls.get('chat_threads')?.updateMany).not.toHaveBeenCalled();
  });

  it('chat history reporta parcial quando a verificação ainda encontra documentos', async () => {
    const fake = fakeMongo({ remainingCollection: 'chat_messages' });
    const result = await new ChatHistoryService(fake.mongo).deleteAllForCustomer(CUSTOMER, TENANT);

    expect(result).toMatchObject({
      mongoAvailable: true,
      confirmed: false,
      messagesRemaining: 1,
    });
  });

  it('customer-staff history apaga as duas collections por tenant+customer', async () => {
    const fake = fakeMongo();
    const service = new CustomerStaffMessagesService(fake.mongo, {} as TenantConnectionProvider);

    const result = await service.deleteAll(CUSTOMER, TENANT);

    expect(result).toMatchObject({ mongoAvailable: true, confirmed: true });
    expect(fake.calls.get('staff_messages')?.deleteMany).toHaveBeenCalledWith({
      tenantId: TENANT,
      customerId: CUSTOMER,
    });
    expect(fake.calls.get('staff_threads')?.deleteMany).toHaveBeenCalledWith({
      tenantId: TENANT,
      customerId: CUSTOMER,
    });
    expect(fake.calls.get('staff_threads')?.updateMany).not.toHaveBeenCalled();
  });

  it('Mongo offline nunca é tratado como exclusão confirmada', async () => {
    const mongo = { tryDb: () => null } as unknown as MongoService;
    const chat = await new ChatHistoryService(mongo).deleteAllForCustomer(CUSTOMER, TENANT);
    const staff = await new CustomerStaffMessagesService(
      mongo,
      {} as TenantConnectionProvider,
    ).deleteAll(CUSTOMER, TENANT);

    expect(chat).toMatchObject({ mongoAvailable: false, confirmed: false });
    expect(staff).toMatchObject({ mongoAvailable: false, confirmed: false });
  });
});
