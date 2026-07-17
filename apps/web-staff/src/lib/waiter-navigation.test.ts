import { waiterDirectOrderPath } from './waiter-navigation';

describe('waiterDirectOrderPath', () => {
  it('leva QR do fluxo Novo ao pedido direto da mesa', () => {
    expect(waiterDirectOrderPath('restaurant_dev', 'T 05')).toBe(
      '/waiter/order-direct?tenant=restaurant_dev&table=T+05',
    );
  });

  it('preserva numero de mesa quando conhecido', () => {
    expect(waiterDirectOrderPath('restaurant_dev', 'T05', 5)).toBe(
      '/waiter/order-direct?tenant=restaurant_dev&table=T05&tableNumber=5',
    );
  });
});
