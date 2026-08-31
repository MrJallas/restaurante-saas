import { execFileSync } from 'node:child_process';

/**
 * Pré-condições da gravação da "noite cheia".
 *
 * Estes passos NÃO são caprichos de limpeza — cada um evita um modo de falha
 * que destrói a tomada inteira:
 *
 *  · sessão ativa na mesa 91  → o cliente entra como "segundo cliente" e cai no
 *    fluxo de aprovação por OUTRO CLIENTE, não pela recepção. A tela de espera
 *    que o vídeo quer mostrar nunca aparece.
 *  · release de QR válida     → o cliente entra APROVADO DIRETO (a liberação
 *    vale 15 min). Mesmo efeito: sem tela de espera, sem vídeo.
 *  · escala do dia já gravada → o POST de escalar estoura índice único com 400
 *    "Funcionário já escalado nesse turno nessa data" na segunda tomada.
 */

const PSQL = ['exec', '-i', 'restaurant-postgres', 'psql', '-p', '5434', '-U', 'postgres', '-d', 'restaurant_saas'];

function sql(query: string): string {
  return execFileSync('docker', [...PSQL, '-t', '-A', '-F', '|', '-c', query], {
    encoding: 'utf8',
    timeout: 30_000,
  }).trim();
}

/** Turno usado na gravação. Ver escolherTurno(). */
export interface Turno {
  id: string;
  label: string;
  inicio: string;
  fim: string;
}

/**
 * Escolhe o turno em que a escala vai ser feita.
 *
 * `onShift` (que acende "Carga por garçom · em turno" no mapa e nos KPIs) exige
 * DUAS coisas: existir assignment para a data de hoje E o relógio civil estar
 * dentro de [time_start, time_end). Escalar na NOITE e gravar às 14h faz a
 * seção sumir do DOM — não é estado vazio, é ausência.
 *
 * Por isso: se a hora atual couber num turno "de verdade", usa ele; senão cai
 * no turno que cobre o dia inteiro.
 */
export function escolherTurno(): Turno {
  const linhas = sql(
    `select id, label, time_start, time_end,
            (localtime >= time_start and localtime < time_end) as vale_agora
       from restaurant_dev.staff_shifts order by sort_order, time_start`,
  )
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [id, label, inicio, fim, vale] = l.split('|');
      return { id, label, inicio, fim, valeAgora: vale === 't' };
    });

  const cobreODiaTodo = linhas.find((t) => t.inicio.startsWith('00:00') && t.fim.startsWith('23:5'));
  const atual = linhas.find((t) => t.valeAgora && t !== cobreODiaTodo);
  const escolhido = atual ?? cobreODiaTodo ?? linhas[0];

  console.log(
    `  turno escolhido: ${escolhido.label} (${escolhido.inicio}–${escolhido.fim})` +
      (atual ? ' — corresponde ao relógio' : ' — fallback de dia inteiro'),
  );
  return { id: escolhido.id, label: escolhido.label, inicio: escolhido.inicio, fim: escolhido.fim };
}

/** Zera as mesas de QR e a escala do dia. Roda ANTES do t=0, nunca durante. */
export function resetarEstado(mesas = ['QRTEST91', 'QRTEST92']) {
  const lista = mesas.map((m) => `'${m}'`).join(',');

  sql(`
    -- sessões abertas e tudo que pendura nelas
    update restaurant_dev.table_sessions ts set status='closed', closed_at=now()
      from restaurant_dev.tables t
     where t.id=ts.table_id and t.code in (${lista}) and ts.status='active';

    -- liberações de QR ainda válidas (senão o cliente entra sem passar pela recepção)
    update restaurant_dev.table_qr_releases r set consumed_at=now()
      from restaurant_dev.tables t
     where t.id=r.table_id and t.code in (${lista}) and r.consumed_at is null;

    -- Fila de verificação e cadeia de escalonamento.
    --
    -- A referência entre as duas é MÚTUA: escalation_chains aponta para o
    -- pedido por (kind, source_id) — polimórfica, sem FK — e o pedido aponta
    -- de volta por scan_verification_requests.escalation_chain_id, essa sim
    -- com FK. Então a ordem correta é apagar o PEDIDO primeiro (soltando a
    -- FK) e só depois a chain, que a essa altura ficou órfã.
    delete from restaurant_dev.scan_verification_requests;
    delete from restaurant_dev.late_arrival_requests;

    -- Só apaga a chain que ficou ÓRFÃ. Várias tabelas apontam para
    -- escalation_chains por FK (scan_verification_requests,
    -- late_arrival_requests, e potencialmente outras que virão), então caçar
    -- FK por FK é jogo perdido: qualquer tabela nova quebra o reset de novo.
    -- Deletar só o que ninguém referencia é correto por construção — e chain
    -- órfã não afeta o vídeo, o que importa é não sobrar verificação pendente.
    delete from restaurant_dev.escalation_chains ec
     where ec.kind in ('scan_verification', 'late_arrival')
       and not exists (select 1 from restaurant_dev.scan_verification_requests s
                        where s.escalation_chain_id = ec.id)
       and not exists (select 1 from restaurant_dev.late_arrival_requests l
                        where l.escalation_chain_id = ec.id);

    -- escala de hoje, para a próxima tomada não bater no índice único
    update restaurant_dev.staff_shift_assignments set removed_at=now()
     where work_date=(now() at time zone 'America/Sao_Paulo')::date and removed_at is null;

    -- zonas de hoje
    delete from restaurant_dev.waiter_zone_assignments
     where work_date=(now() at time zone 'America/Sao_Paulo')::date;
  `);
}

/**
 * Confirma que a mesa está no estado que FORÇA a tela de espera.
 * Tem que voltar 0|0|0; qualquer outro valor significa tomada envenenada.
 */
export function conferirGuarda(mesa = 'QRTEST91'): { ok: boolean; valores: string } {
  const v = sql(`
    select (select count(*) from restaurant_dev.table_sessions ts
              join restaurant_dev.tables t on t.id=ts.table_id
             where t.code='${mesa}' and ts.status='active'),
           (select count(*) from restaurant_dev.table_qr_releases r
              join restaurant_dev.tables t on t.id=r.table_id
             where t.code='${mesa}' and r.consumed_at is null and r.expires_at>now()),
           (select count(*) from restaurant_dev.scan_verification_requests where status='pending')`);
  return { ok: v === '0|0|0', valores: v };
}

/** CPF sintético válido (dois dígitos verificadores corretos), inédito a cada chamada. */
export function cpfNovo(): string {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const dv = (nums: number[]) => {
    const peso = nums.length + 1;
    const soma = nums.reduce((acc, n, i) => acc + n * (peso - i), 0);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(base);
  const d2 = dv([...base, d1]);
  return [...base, d1, d2].join('');
}

export const staffDoDia = () => ({
  garcons: ['Ana Garcom', 'Bruno Garcom', 'Garcom Demo'],
  cozinha: ['Carlos Cozinha'],
});
