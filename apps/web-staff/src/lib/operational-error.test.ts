import {
  isAuthoritativeEmpty,
  operationalErrorCopy,
  retainRowsOnFailure,
} from './operational-error';

describe('operationalErrorCopy', () => {
  it('distingue sessao expirada', () => {
    expect(operationalErrorCopy({ status: 401 }, 'a fila')).toContain('Sessão expirada');
    expect(operationalErrorCopy({ code: 'AUTH_INVALID' }, 'a fila')).toContain('Sessão expirada');
  });

  it('explica falha de rede sem declarar estado vazio', () => {
    expect(operationalErrorCopy(new Error('fetch failed'), 'as mesas')).toBe(
      'Não foi possível atualizar as mesas. Tente novamente.',
    );
  });

  it('só declara vazio depois de carga autoritativa', () => {
    expect(isAuthoritativeEmpty('ready', 0)).toBe(true);
    expect(isAuthoritativeEmpty('loading', 0)).toBe(false);
    expect(isAuthoritativeEmpty('error', 0)).toBe(false);
  });

  it('preserva o último snapshot quando uma fonte falha', () => {
    const previous = [{ id: 'pronto-1' }];
    expect(
      retainRowsOnFailure(previous, { status: 'rejected', reason: new Error('offline') }),
    ).toBe(previous);
    expect(retainRowsOnFailure(previous, { status: 'fulfilled', value: [] })).toEqual([]);
  });
});
