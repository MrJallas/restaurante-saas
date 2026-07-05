import { buildComplaintRedirect } from './ScreenCustomerOrderRating';

describe('buildComplaintRedirect (bug: 3★ + comentário → composer perde o texto)', () => {
  it('BUG: carrega o comentário digitado através do redirect (não só orderId)', () => {
    // Antes do fix, ao cair no composer só ia `?orderId=...` e o texto do
    // comentário sumia sem aviso — o cliente redigitava do zero.
    const url = buildComplaintRedirect('boston', 'ord-1', 'demorou 40 min');
    expect(url).toContain('orderId=ord-1');
    expect(url).toContain(`comment=${encodeURIComponent('demorou 40 min')}`);
  });

  it('escapa caracteres especiais do comentário na query', () => {
    const url = buildComplaintRedirect('boston', 'ord-1', 'a & b = c?');
    expect(url).toContain(`comment=${encodeURIComponent('a & b = c?')}`);
    // o orderId permanece intacto e separável
    expect(url).toContain('orderId=ord-1');
  });

  it('comentário vazio / só espaços → NÃO adiciona comment= (composer abre limpo)', () => {
    expect(buildComplaintRedirect('boston', 'ord-1', '')).toBe(
      '/boston/complaints/new?orderId=ord-1',
    );
    expect(buildComplaintRedirect('boston', 'ord-1', '   ')).toBe(
      '/boston/complaints/new?orderId=ord-1',
    );
  });

  it('escapa o orderId também (defensivo)', () => {
    const url = buildComplaintRedirect('boston', 'a/b', 'x');
    expect(url).toContain(`orderId=${encodeURIComponent('a/b')}`);
  });
});
