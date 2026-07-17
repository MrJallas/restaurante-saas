import { EventsGateway } from './events.gateway';

describe('EventsGateway.disconnectCustomer', () => {
  it('derruba só sockets customer reconhecidos, sem expulsar staff na mesma room', () => {
    const gateway = new EventsGateway({} as never, {} as never, {} as never);
    const target = {
      data: { authType: 'session', customerId: 'customer-1' },
      disconnect: jest.fn(),
    };
    const other = {
      data: { authType: 'session', customerId: 'customer-2' },
      disconnect: jest.fn(),
    };
    const staff = {
      data: { authType: 'staff', customerId: 'customer-1', staffId: 'staff-1' },
      disconnect: jest.fn(),
    };
    (gateway as unknown as { server: unknown }).server = {
      sockets: {
        sockets: new Map([
          ['a', target],
          ['b', other],
          ['c', staff],
        ]),
      },
    };

    gateway.disconnectCustomer('customer-1');

    expect(target.disconnect).toHaveBeenCalledWith(true);
    expect(other.disconnect).not.toHaveBeenCalled();
    expect(staff.disconnect).not.toHaveBeenCalled();
  });
});
