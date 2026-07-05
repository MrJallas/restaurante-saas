import { describeDeletionResult } from './ScreenCustomerMe';

describe('describeDeletionResult (bug: LGPD apagar conversas ignora deletedCount)', () => {
  it('BUG: apagou mensagens da equipe → confirma quantas, NÃO "nenhuma por aqui ainda"', () => {
    // Antes do fix, qualquer sucesso exibia sempre "Nenhuma mensagem por aqui
    // ainda", mesmo tendo apagado — feedback enganoso numa ação LGPD.
    const msg = describeDeletionResult('staff', 3);
    expect(msg).not.toMatch(/nenhuma/i);
    expect(msg).toMatch(/3/);
  });

  it('empty-state só quando REALMENTE não havia nada (count = 0)', () => {
    expect(describeDeletionResult('staff', 0)).toBe('Nenhuma mensagem com a equipe por aqui ainda.');
    expect(describeDeletionResult('ai', 0)).toBe('Nenhuma conversa com IA por aqui ainda.');
    expect(describeDeletionResult('all', 0)).toBe('Nenhuma mensagem por aqui ainda.');
  });

  it('singular vs plural na confirmação', () => {
    expect(describeDeletionResult('ai', 1)).toMatch(/1 conversa\b/);
    expect(describeDeletionResult('ai', 2)).toMatch(/2 conversas\b/);
  });

  it('confirma por escopo apagado', () => {
    expect(describeDeletionResult('staff', 2)).toMatch(/equipe/i);
    expect(describeDeletionResult('ai', 2)).toMatch(/IA/);
    expect(describeDeletionResult('all', 5)).toMatch(/5/);
  });
});
