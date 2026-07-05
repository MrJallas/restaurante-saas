/**
 * Bug P2 (re-scan 2026-07-05): o beep de "pedido novo" na /cozinha usava
 * DELTA DE CONTAGEM (`activeOrders.length > prevCount`). Se um pedido saía
 * (delivered/cancelled) e outro entrava no MESMO poll, a contagem ficava
 * constante → beep NÃO tocava → cozinha PERDIA o pedido novo.
 *
 * O TvKdsBoard já detecta certo por DIFF DE CONJUNTO de ids
 * (`list.some((o) => !previousIds.has(o.id))`). Espelhamos aqui: a função
 * pura `hasNewOrderIds` recebe o conjunto de ids do poll anterior + os ids do
 * poll atual e responde se APARECEU algum id NOVO — independente da contagem.
 *
 * RED com o comparador antigo (contagem): {a,b} → {b,c} tem length 2 == 2,
 * então `count > prevCount` é false e NÃO bipa (perde 'c'). GREEN com o diff
 * de conjunto: 'c' é novo → deve bipar.
 */
import { hasNewOrderIds } from './new-order-beep';

describe('hasNewOrderIds — diff de conjunto (não de contagem)', () => {
  it('bipa quando entra um id NOVO mesmo com contagem constante (um sai, um entra)', () => {
    const prev = new Set(['a', 'b']);
    const next = ['b', 'c']; // count 2 == 2, mas 'c' é novo
    expect(hasNewOrderIds(prev, next)).toBe(true);
  });

  it('bipa quando a contagem cresce (pedido novo puro)', () => {
    expect(hasNewOrderIds(new Set(['a']), ['a', 'b'])).toBe(true);
  });

  it('NÃO bipa quando o conjunto é o mesmo (poll sem novidade)', () => {
    expect(hasNewOrderIds(new Set(['a', 'b']), ['b', 'a'])).toBe(false);
  });

  it('NÃO bipa quando SÓ SAÍRAM pedidos (contagem cai, nada novo)', () => {
    expect(hasNewOrderIds(new Set(['a', 'b', 'c']), ['a'])).toBe(false);
  });

  it('não bipa no conjunto anterior vazio (primeira carga é responsabilidade do caller)', () => {
    // Semântica pura: sem ids anteriores, tudo é "novo". O guard de primeira
    // carga (prevSize > 0) fica no caller, igual ao prevCount > 0 antigo e ao
    // isInitialLoad do TvKdsBoard.
    expect(hasNewOrderIds(new Set(), ['a'])).toBe(true);
  });
});
