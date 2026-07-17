import type { AlertActionDescriptor } from './api/manager';
import { normalizeAlertActions, resolveManagerAlertRoute } from './alert-actions';

describe('manager alert actions', () => {
  it('preserva 0, 1 e 2 descritores sem fabricar botoes', () => {
    expect(normalizeAlertActions([])).toEqual([]);
    expect(
      normalizeAlertActions([{ label: 'Abrir conversa', route: '/manager/mensagens/abc' }]),
    ).toHaveLength(1);
    expect(
      normalizeAlertActions([
        { label: 'Primaria', kind: 'primary' },
        { label: 'Secundaria', kind: 'ghost' },
        { label: 'Excedente' },
      ]),
    ).toHaveLength(2);
  });

  it('usa a rota interna fornecida pelo backend', () => {
    const action: AlertActionDescriptor = {
      label: 'Abrir conversa',
      route: '/manager/mensagens/thread-1?slug=restaurant_dev',
    };
    expect(resolveManagerAlertRoute(action, 'restaurant_dev')).toBe(action.route);
  });

  it('preserva o tenant ao navegar por uma rota interna sem slug', () => {
    expect(
      resolveManagerAlertRoute(
        { label: 'Ver sobrecarga', route: '/manager/equipe/sobrecarga' },
        'pwload711',
      ),
    ).toBe('/manager/equipe/sobrecarga?slug=pwload711');
  });

  it('rejeita rota externa e usa fallback seguro', () => {
    expect(
      resolveManagerAlertRoute({ label: 'Abrir', route: '//evil.example/phish' }, 'restaurant_dev'),
    ).toBe('/manager/alertas?slug=restaurant_dev');
  });

  it('mantem fallback por label para alertas antigos sem route', () => {
    expect(resolveManagerAlertRoute({ label: 'Ver fila da cozinha' }, 'restaurant_dev')).toBe(
      '/manager/kitchen-reorder?slug=restaurant_dev',
    );
  });
});
