import {
  COMPLAINT_TEAM_COPY,
  complaintStatusDescription,
  complaintStatusTitle,
} from './complaintTeamCopy';

describe('copy honesta de reclamações', () => {
  it('não inventa pessoa, presença ou SLA', () => {
    const allCopy = [
      ...Object.values(COMPLAINT_TEAM_COPY),
      complaintStatusTitle('created', false),
      complaintStatusTitle('responded', false),
      complaintStatusDescription('created', false),
    ].join(' ');

    expect(allCopy).not.toMatch(/Renata/i);
    expect(allCopy).not.toMatch(/online agora/i);
    expect(allCopy).not.toMatch(/~\s*2|minutos?/i);
  });

  it('distingue aviso, resposta e resolução sem prometer prazo', () => {
    expect(complaintStatusTitle('created', false)).toBe('A equipe foi avisada');
    expect(complaintStatusTitle('responded', false)).toBe('A equipe respondeu');
    expect(complaintStatusTitle('created', true)).toBe('Resolvida');
    expect(complaintStatusDescription('created', false)).toMatch(/quando for enviada/i);
  });
});
