export const COMPLAINT_TEAM_COPY = {
  badge: 'Atendimento pela equipe',
  composeDescription:
    'Conte o que aconteceu. A equipe do restaurante receberá sua mensagem e a resposta aparecerá aqui quando for enviada.',
  submit: 'Enviar para a equipe',
  pending: 'Aguardando resposta da equipe',
  bubbleName: 'Equipe',
  bubbleRole: 'Restaurante',
} as const;

export function complaintStatusTitle(status: string | undefined, resolved: boolean): string {
  if (resolved) return 'Resolvida';
  return status === 'responded' ? 'A equipe respondeu' : 'A equipe foi avisada';
}

export function complaintStatusDescription(status: string | undefined, resolved: boolean): string {
  if (resolved) {
    return 'A equipe marcou como resolvida. Se algo ainda incomoda, é só falar.';
  }
  if (status === 'responded') return 'Confira a resposta abaixo.';
  return 'A resposta aparecerá aqui quando for enviada.';
}
