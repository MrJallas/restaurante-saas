import { formatOpeningHoursForAssistant } from './assistant.service';

describe('assistant opening-hours context', () => {
  it('expõe horários reais, inclusive janela que cruza meia-noite', () => {
    expect(
      formatOpeningHoursForAssistant({
        mon: null,
        tue: [{ open: '18:00', close: '23:30' }],
        wed: [{ open: '18:00', close: '23:30' }],
        thu: [{ open: '18:00', close: '23:30' }],
        fri: [{ open: '18:00', close: '01:00' }],
        sat: [{ open: '12:00', close: '23:30' }],
        sun: [{ open: '12:00', close: '16:00' }],
      }),
    ).toContain('Sexta: 18:00–01:00');
  });

  it('não inventa horário quando ainda não foi configurado', () => {
    expect(formatOpeningHoursForAssistant(null)).toMatch(/ainda não cadastrados/i);
  });
});
