/**
 * CHARACTERIZATION (FASE 2 · KDS): congela o comportamento das duas leituras
 * de fila da cozinha extraídas do orders.service. Fixa: (a) o predicado de
 * estação — bar filtra pelo FLAG autoritativo `menu_items.kind = 'drink'`,
 * cozinha filtra `<> 'drink'` (NÃO pelo nome da categoria — bug P1 re-scan:
 * uma bebida numa categoria "Cervejas"/"Vinhos" caía na cozinha porque o
 * predicado antigo comparava `LOWER(TRIM(mc.name)) = 'bebidas'`); (b) o
 * mapeamento numérico priority_bucket → label (0=urgent, 1=vip, 2=normal,
 * fora-de-range → normal) e a REMOÇÃO da coluna priority_bucket do output;
 * (c) getKitchenQueue devolve o resultado da query direto (passthrough).
 *
 * O sweep-throttled NÃO é responsabilidade deste serviço (fica no wrapper do
 * orders.service) — por isso estas leituras não tocam Redis nem sweep.
 */

import { KdsQueryService } from './kds-query.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';

function fakeConn(rows: unknown[]) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
    return rows;
  };
  return { calls, conn: { query } as unknown as TenantConnectionProvider };
}

describe('KdsQueryService — characterization (extraído do orders.service)', () => {
  it("getActiveOrdersForKds('bar') roteia pelo kind='drink' e mapeia priority_bucket → label", async () => {
    const { calls, conn } = fakeConn([
      { id: 'o1', priority_bucket: 0, items: [] },
      { id: 'o2', priority_bucket: 1, items: [] },
      { id: 'o3', priority_bucket: 2, items: [] },
      { id: 'o4', priority_bucket: 9, items: [] },
    ]);

    const out = await new KdsQueryService(conn).getActiveOrdersForKds('bar');

    // Bar roteia pelo FLAG autoritativo (indexado, migration 016), NÃO pelo
    // nome da categoria. Uma bebida em "Cervejas"/"Vinhos" também vai pro bar.
    expect(calls[0].sql).toContain("mi.kind = 'drink'");
    expect(calls[0].sql).not.toContain("'bebidas'");
    expect(out.map((o) => (o as { priority: string }).priority)).toEqual([
      'urgent',
      'vip',
      'normal',
      'normal',
    ]);
    // priority_bucket é interno — não vaza pro cliente da TV
    expect(out[0]).not.toHaveProperty('priority_bucket');
    expect(out[0]).toHaveProperty('id', 'o1');
  });

  it("getActiveOrdersForKds('kitchen') exclui bebidas pelo kind (não pelo nome da categoria)", async () => {
    const { calls, conn } = fakeConn([]);
    await new KdsQueryService(conn).getActiveOrdersForKds('kitchen');
    // Cozinha = tudo que NÃO é bebida pelo flag; nada depende de "bebidas".
    expect(calls[0].sql).toContain("mi.kind <> 'drink'");
    expect(calls[0].sql).not.toContain("'bebidas'");
  });

  it("BUG P1: bebida numa categoria que NÃO se chama 'Bebidas' (ex.: 'Cervejas') vai pro BAR", async () => {
    // Regressão do bug de roteamento por nome de categoria: o seed usa a
    // categoria literal "Bebidas", o que MASCARAVA o bug. Prova o contrato
    // correto lendo o predicado SQL gerado — ele deve casar por
    // menu_items.kind = 'drink' e NUNCA restringir o bar à categoria
    // "bebidas". Assim uma cerveja (kind='drink', categoria "Cervejas")
    // aparece no KDS do bar em vez de cair na cozinha.
    const { calls, conn } = fakeConn([]);
    await new KdsQueryService(conn).getActiveOrdersForKds('bar');

    const barSql = calls[0].sql;
    // O bar seleciona itens de bebida pelo flag, independentemente da categoria.
    expect(barSql).toContain("mi.kind = 'drink'");
    // Nenhuma dependência do nome de categoria "bebidas" — sem isso, "Cervejas"
    // seria roteada erroneamente pra cozinha. (mc.name segue no SELECT só como
    // metadado de display `categoryName`, não é fonte de roteamento.)
    expect(barSql.toLowerCase()).not.toContain('bebidas');
  });

  it('BUG P1 (pedido MISTO): a estação vê só os itens NÃO-prontos DELA (status por item, migration 071)', async () => {
    // Pedido food+drink compartilhava UM status: o bar marcar a bebida ready
    // sumia a comida da cozinha. Agora o feed filtra por oi.status: enquanto o
    // pedido não está totalmente pronto, exclui os itens ready DA ESTAÇÃO; a
    // reconciliação do order (advanceStationItems) só vira 'ready' com todos
    // os itens prontos, e aí o card volta completo pra "Prontos".
    const { calls, conn } = fakeConn([]);
    await new KdsQueryService(conn).getActiveOrdersForKds('kitchen');
    const sql = calls[0].sql.replace(/\s+/g, ' ');
    // Item pronto é escondido do feed da estação (a menos que o pedido inteiro
    // já esteja 'ready', quando o card completo reaparece pra chamar o garçom).
    expect(sql).toContain("(o.status = 'ready' OR oi.status <> 'ready')");
    // O status do card é LOCAL: outra estação pode ter colocado o order
    // agregado em in_progress sem que estes itens tenham começado.
    expect(sql).toContain("BOOL_OR(oi.status = 'in_progress')");
    expect(sql).toContain('o.status AS order_status');
    expect(sql).toContain("'status', oi.status");
  });

  it("P2 (drink size): getActiveOrdersForKds expõe 'size' por item pra cozinha/bar preparar o tamanho certo", async () => {
    const { calls, conn } = fakeConn([]);
    await new KdsQueryService(conn).getActiveOrdersForKds('bar');
    // O commit 38b99be fez o PREÇO do tamanho chegar, mas o LABEL escolhido
    // (Peq/Méd/Grande) não era exposto no feed do KDS. Agora cada item traz
    // 'size' (oi.size) pra renderizar o badge de tamanho no card.
    expect(calls[0].sql).toContain("'size', oi.size");
  });

  it("P2 (drink size): getKitchenQueue expõe 'size' por item na fila do /cozinha", async () => {
    const { calls, conn } = fakeConn([]);
    await new KdsQueryService(conn).getKitchenQueue();
    expect(calls[0].sql).toContain("'size', oi.size");
  });

  it('BUG P2 (KDS legado): getKitchenQueue exclui bebidas pelo kind (bebida não aparece no painel do cozinheiro)', async () => {
    // O /cozinha (KDS legado) NÃO separava por estação: a query juntava
    // `menu_items mi` mas não filtrava `mi.kind`, então uma bebida
    // (kind='drink') caía na fila da cozinha. Isso é o 3º ponto que flipa o
    // status de um pedido MISTO (food+drink). Agora leitura e escrita usam a
    // cozinha explicitamente. Espelha o predicado do getActiveOrdersForKds:
    // cozinha = tudo que NÃO é bebida pelo flag autoritativo (migration 016).
    const { calls, conn } = fakeConn([]);
    await new KdsQueryService(conn).getKitchenQueue();
    const sql = calls[0].sql;
    expect(sql).toContain("mi.kind <> 'drink'");
    // Roteamento pelo FLAG, nunca pelo nome da categoria.
    expect(sql.toLowerCase()).not.toContain("'bebidas'");
    // Também usa o status local e some quando os itens da cozinha terminam;
    // o status agregado de um bar ativo não pode adiantar o botão da cozinha.
    expect(sql).toContain("BOOL_OR(oi.status = 'in_progress')");
    expect(sql).toContain("(o.status = 'ready' OR oi.status <> 'ready')");
  });

  it('getKitchenQueue devolve o resultado da query direto (passthrough)', async () => {
    const rows = [{ id: 'k1', status: 'received' }];
    const { conn } = fakeConn(rows);
    const out = await new KdsQueryService(conn).getKitchenQueue();
    expect(out).toBe(rows);
  });

  it('BUG P2: getKitchenQueue só traz pedidos de sessão ATIVA (pedido órfão de sessão FECHADA não fica preso na fila)', async () => {
    // Uma sessão encerrada sem o pedido sair da fila deixava um pedido órfão
    // preso pra sempre (a query só filtrava por o.status). Agora exige sessão
    // ativa OU pedido já em preparo (in_progress/ready) pra não esconder um
    // pedido legítimo sendo cozinhado quando a sessão fecha no meio.
    const { calls, conn } = fakeConn([]);
    await new KdsQueryService(conn).getKitchenQueue();
    const sql = calls[0].sql;
    expect(sql).toContain("ts.status = 'active'");
    // Safeguard: pedido em preparo permanece mesmo se a sessão fechou.
    expect(sql).toContain("o.status IN ('in_progress', 'ready')");
  });

  it('BUG P2: getKitchenQueue tem janela de tempo (pedido antigo não fica preso indefinidamente)', async () => {
    const { calls, conn } = fakeConn([]);
    await new KdsQueryService(conn).getKitchenQueue();
    const sql = calls[0].sql;
    // Mesma janela do feed da TV (8h) — cobre um turno longo sem prender
    // pedidos zumbis de dias atrás.
    expect(sql).toContain("o.created_at > now() - interval '8 hours'");
  });
});
