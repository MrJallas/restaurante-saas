/**
 * P0 da auditoria 2026-07-03: barreira de restrição alimentar furada no
 * fallback. Com `dietary=gluten_free` e NENHUM item aprovado no filtro
 * determinístico por allergens, `enrichRecommendationToolCalls` caía em
 * `menuItems.slice(0, 3)` SEM filtro — recomendando prato com glúten
 * declarado sob o texto "opções sem glúten".
 *
 * Doutrina (decisão Caleb 2026-06-12): modelo/fallback não têm voto em
 * alergia; o dado declarado decide. Zero aprovados = resposta honesta de
 * "não encontrei", nunca uma lista sem filtro.
 */

import { enrichRecommendationToolCalls } from './assistant.service';

type MenuItems = Parameters<typeof enrichRecommendationToolCalls>[3];

interface FakeMenuItem {
  id: string;
  name: string;
  category_name: string;
  price_cents: number;
  allergens: string[];
  tags: string[];
}

function item(name: string, category_name: string, allergens: string[]): FakeMenuItem {
  return { id: name, name, category_name, price_cents: 2500, allergens, tags: [] };
}

const asMenu = (xs: FakeMenuItem[]) => xs as unknown as MenuItems;

const BRUSCHETTA = item('Bruschetta da Casa', 'Entradas', ['gluten']);
const LASANHA = item('Lasanha à Bolonhesa', 'Pratos Principais', ['gluten', 'leite']);
const BROWNIE = item('Brownie com Sorvete', 'Sobremesas', ['gluten', 'ovo']);
const SALADA = item('Salada Caprese', 'Saladas', ['leite']);

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

function recommendCall(dietary?: string) {
  return { name: 'recommend_dish', arguments: dietary ? { dietary } : {} } as Record<
    string,
    unknown
  >;
}

describe('enrichRecommendationToolCalls — barreira de alérgeno no fallback', () => {
  it('dietary ativo + zero candidatos aprovados → NUNCA lista prato com o alérgeno', () => {
    // Cardápio onde TUDO tem glúten declarado.
    const r = enrichRecommendationToolCalls(
      'tem alguma opção sem glúten?',
      'Deixa eu ver o cardápio...',
      [recommendCall('gluten_free')],
      asMenu([BRUSCHETTA, LASANHA, BROWNIE]),
    );

    for (const proibido of ['Bruschetta', 'Lasanha', 'Brownie']) {
      expect(r.response).not.toContain(proibido);
    }
    expect(normalize(r.response)).toContain('nao encontrei');

    const enriched = r.toolCalls.find((tc) => tc.name === 'recommend_dish')!;
    expect(enriched.chips).toEqual([]); // sem chip "quero o <prato com glúten>"
  });

  it('dietary ativo com candidato aprovado → só o aprovado aparece (característico)', () => {
    const r = enrichRecommendationToolCalls(
      'tem alguma opção sem glúten?',
      'Deixa eu ver o cardápio...',
      [recommendCall('gluten_free')],
      asMenu([BRUSCHETTA, LASANHA, SALADA]),
    );

    expect(r.response).toContain('Salada Caprese');
    expect(r.response).not.toContain('Bruschetta');
    expect(r.response).not.toContain('Lasanha');

    const enriched = r.toolCalls.find((tc) => tc.name === 'recommend_dish')!;
    const chips = enriched.chips as Array<{ label: string }>;
    expect(chips.map((c) => c.label)).toEqual(['Salada Caprese']);
  });

  it('SEM dietary, zero candidatos da categoria → fallback genérico continua (característico)', () => {
    // Pediu sobremesa num cardápio só de entradas/salada: o fallback dos 3
    // primeiros é intencional quando NÃO há restrição alimentar em jogo.
    const r = enrichRecommendationToolCalls(
      'me indica uma sobremesa',
      'Deixa eu ver o cardápio...',
      [recommendCall()],
      asMenu([BRUSCHETTA, SALADA]),
    );

    const enriched = r.toolCalls.find((tc) => tc.name === 'recommend_dish')!;
    const chips = enriched.chips as Array<{ label: string }>;
    expect(chips.length).toBeGreaterThan(0);
    expect(r.response).toContain('Bruschetta');
  });
});
