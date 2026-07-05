import { resolveFeedbackSubmission } from './resolveFeedback';

describe('resolveFeedbackSubmission (bug: POST /feedbacks 400 em loop sem visitId)', () => {
  const base = {
    visitId: 'v-1',
    customerId: 'c-1',
    rating: 4,
    tags: ['Comida'],
    comment: 'ótimo',
  };

  it('sessão válida → payload pronto pro POST (visitId presente)', () => {
    const res = resolveFeedbackSubmission(base);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.payload).toEqual({
        visitId: 'v-1',
        customerId: 'c-1',
        overallRating: 4,
        tags: ['Comida'],
        comment: 'ótimo',
      });
    }
  });

  it('BUG: sem visitId → NÃO submete; devolve erro claro (não loop de 400)', () => {
    // O backend exige visitId (@IsUUID @IsNotEmpty); mandar undefined é 400
    // garantido, e o retry manda undefined de novo → loop permanente.
    const res = resolveFeedbackSubmission({ ...base, visitId: null });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/não .*registrar|sess|não consegui/i);
      expect(res.error).not.toMatch(/tente novamente/i); // não convida a repetir o que sempre falha
    }
  });

  it('visitId em branco também bloqueia (guard não confia em string vazia)', () => {
    expect(resolveFeedbackSubmission({ ...base, visitId: '' }).ok).toBe(false);
    expect(resolveFeedbackSubmission({ ...base, visitId: '   ' }).ok).toBe(false);
  });

  it('rating 0 (nenhuma estrela) não passa', () => {
    expect(resolveFeedbackSubmission({ ...base, rating: 0 }).ok).toBe(false);
  });

  it('comentário / customerId vazios viram undefined no payload (omitidos)', () => {
    const res = resolveFeedbackSubmission({ ...base, comment: '', customerId: null });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.payload.comment).toBeUndefined();
      expect(res.payload.customerId).toBeUndefined();
    }
  });
});
