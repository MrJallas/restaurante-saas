/**
 * Recomendação personalizada por histórico (decisão Caleb 2026-06-13:
 * "Mix: repetir + parecido"). Testa o núcleo puro `rankCandidatesByHistory`:
 * cliente retornante lidera com o item que já pediu (repeat) + parecidos
 * da mesma categoria; primeira visita (sem histórico) cai no genérico.
 *
 * Os filtros de categoria/alérgeno ficam FORA daqui — o ranking recebe os
 * candidatos já filtrados, então a barreira de segurança é preservada por
 * construção (um item com o alérgeno declarado nunca chega nos candidatos).
 */

import {
  rankCandidatesByHistory,
  type ConsumptionHistoryItem,
} from './assistant.service';

interface FakeMenuItem {
  id: string;
  name: string;
  category_name: string;
  price_cents: number;
}

function item(name: string, category_name: string): FakeMenuItem {
  return { id: name, name, category_name, price_cents: 1000 };
}

// O ranking só lê name + category_name; cast pra MenuItemRow via unknown.
const asMenu = (xs: FakeMenuItem[]) => xs as unknown as Parameters<typeof rankCandidatesByHistory>[0];

const PICANHA = item('Picanha na Brasa', 'Pratos Principais');
const FILE = item('Filé Mignon ao Molho Madeira', 'Pratos Principais');
const RISOTO = item('Risoto de Funghi', 'Pratos Principais');
const PUDIM = item('Pudim da Casa', 'Sobremesas');
const SUCO = item('Suco de Laranja', 'Bebidas');

describe('rankCandidatesByHistory', () => {
  it('primeira visita (sem histórico) → ordem original, sem personalização', () => {
    const r = rankCandidatesByHistory(asMenu([PICANHA, FILE, PUDIM]), []);
    expect(r.personalized).toBe(false);
    expect(r.repeat).toBeNull();
    expect(r.ordered.map((i) => i.name)).toEqual([
      'Picanha na Brasa',
      'Filé Mignon ao Molho Madeira',
      'Pudim da Casa',
    ]);
  });

  it('retornante: lidera com o item já pedido (repeat) e depois parecidos da mesma categoria', () => {
    // Pediu Picanha (Pratos Principais) da última vez.
    const last: ConsumptionHistoryItem[] = [
      { name: 'Picanha na Brasa', category: 'Pratos Principais', quantity: 1 },
    ];
    // Candidatos em ordem "ruim" de propósito: sobremesa e bebida na frente.
    const r = rankCandidatesByHistory(asMenu([PUDIM, SUCO, FILE, PICANHA, RISOTO]), last);
    expect(r.personalized).toBe(true);
    expect(r.repeat?.name).toBe('Picanha na Brasa');
    // repeat primeiro; depois parecidos (mesma categoria: Filé, Risoto);
    // por último o resto (Pudim, Suco).
    expect(r.ordered.map((i) => i.name)).toEqual([
      'Picanha na Brasa',
      'Filé Mignon ao Molho Madeira',
      'Risoto de Funghi',
      'Pudim da Casa',
      'Suco de Laranja',
    ]);
  });

  it('item antigo indisponível mas categoria existe → parecido (personalizado, sem repeat)', () => {
    // Pediu um prato que NÃO está mais nos candidatos, mas era "Sobremesas".
    const last: ConsumptionHistoryItem[] = [
      { name: 'Petit Gateau', category: 'Sobremesas', quantity: 1 },
    ];
    const r = rankCandidatesByHistory(asMenu([PICANHA, PUDIM, SUCO]), last);
    expect(r.personalized).toBe(true);
    expect(r.repeat).toBeNull(); // não há repeat exato disponível
    // o parecido (Pudim, mesma categoria) sobe na frente do resto.
    expect(r.ordered[0].name).toBe('Pudim da Casa');
  });

  it('histórico sem match nenhum (nem nome nem categoria) → não personaliza', () => {
    const last: ConsumptionHistoryItem[] = [
      { name: 'Prato Fantasma', category: 'Categoria Inexistente', quantity: 1 },
    ];
    const r = rankCandidatesByHistory(asMenu([PICANHA, PUDIM]), last);
    expect(r.personalized).toBe(false);
    expect(r.repeat).toBeNull();
    expect(r.ordered.map((i) => i.name)).toEqual(['Picanha na Brasa', 'Pudim da Casa']);
  });

  it('match é acento-insensível', () => {
    const last: ConsumptionHistoryItem[] = [
      { name: 'file mignon ao molho madeira', category: 'pratos principais' },
    ];
    const r = rankCandidatesByHistory(asMenu([PICANHA, FILE]), last);
    expect(r.repeat?.name).toBe('Filé Mignon ao Molho Madeira');
  });

  it('ignora entradas de histórico malformadas (sem name)', () => {
    const last = [{ category: 'Sobremesas' }, { name: '' }] as ConsumptionHistoryItem[];
    const r = rankCandidatesByHistory(asMenu([PICANHA, PUDIM]), last);
    expect(r.personalized).toBe(false);
  });
});
