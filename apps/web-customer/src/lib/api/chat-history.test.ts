import { api, apiGet } from '../api';
import { deleteAllThreads, deleteThread, listMessages, listThreads } from './chat-history';

jest.mock('../api', () => ({ api: jest.fn(), apiGet: jest.fn() }));

const apiMock = jest.mocked(api);
const apiGetMock = jest.mocked(apiGet);

describe('chat-history API — identidade somente pelo cookie', () => {
  beforeEach(() => {
    apiMock.mockResolvedValue({ ok: true } as never);
    apiGetMock.mockResolvedValue([] as never);
  });

  it('não envia customerId em query nas leituras', async () => {
    await listThreads('restaurant_dev');
    await listMessages('restaurant_dev', 'thread 1');

    expect(apiGetMock).toHaveBeenNthCalledWith(1, '/restaurant_dev/chat-history/threads');
    expect(apiGetMock).toHaveBeenNthCalledWith(
      2,
      '/restaurant_dev/chat-history/threads/thread%201/messages',
    );
  });

  it('não envia customerId em query nas exclusões confirmadas pelo browser', async () => {
    await deleteThread('restaurant_dev', 'thread 1');
    await deleteAllThreads('restaurant_dev');

    expect(apiMock).toHaveBeenNthCalledWith(1, '/restaurant_dev/chat-history/threads/thread%201', {
      method: 'DELETE',
    });
    expect(apiMock).toHaveBeenNthCalledWith(2, '/restaurant_dev/chat-history', {
      method: 'DELETE',
    });
  });
});
