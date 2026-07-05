import { buildEnviadoQuery } from './enviadoQuery';

describe('buildEnviadoQuery (bug: carrinho misto → redirect da /confirmando pra /enviado)', () => {
  it('carrinho de modo único: passa orderId= com o único id', () => {
    expect(buildEnviadoQuery(['ord-1'])).toBe('orderId=ord-1');
  });

  it('BUG carrinho misto: passa TODOS os ids (orderIds=a,b), não só o primeiro', () => {
    // Antes do fix, a /confirmando redirecionava com `orderId=orderIds[0]`,
    // então a tela "Enviado" mostrava só o resumo/total/ETA do 1º pedido.
    expect(buildEnviadoQuery(['ord-1', 'ord-2'])).toBe('orderIds=ord-1,ord-2');
  });

  it('mais de dois pedidos: todos os ids seguem', () => {
    expect(buildEnviadoQuery(['a', 'b', 'c'])).toBe('orderIds=a,b,c');
  });

  it('ignora ids vazios / em branco antes de montar', () => {
    expect(buildEnviadoQuery(['ord-1', '', '  ', 'ord-2'])).toBe('orderIds=ord-1,ord-2');
    expect(buildEnviadoQuery(['', 'ord-9'])).toBe('orderId=ord-9');
  });

  it('lista vazia vira string vazia (nada a passar)', () => {
    expect(buildEnviadoQuery([])).toBe('');
    expect(buildEnviadoQuery(['', '   '])).toBe('');
  });
});
