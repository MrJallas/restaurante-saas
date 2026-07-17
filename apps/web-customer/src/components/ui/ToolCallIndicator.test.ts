import { toolCallStatusLabel } from './ToolCallIndicator';

describe('toolCallStatusLabel', () => {
  it('traduz a recomendação sem expor o identificador interno', () => {
    expect(toolCallStatusLabel('recommend_dish', 'running')).toBe('Buscando sugestões');
    expect(toolCallStatusLabel('RECOMMEND_DISH', 'completed')).toBe('Sugestões encontradas');
  });

  it('usa copy humana e segura para tools futuras', () => {
    expect(toolCallStatusLabel('internal_future_tool', 'running')).toBe('Consultando informações');
    expect(toolCallStatusLabel('internal_future_tool', 'completed')).toBe('Consulta concluída');
    expect(toolCallStatusLabel(undefined, 'completed')).toBeNull();
  });
});
