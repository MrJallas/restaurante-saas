/**
 * Expressões SQL canônicas para o relógio civil do restaurante.
 *
 * `current_date` segue a timezone da conexão PostgreSQL (normalmente UTC),
 * não a configuração do tenant. Além disso, texto legado inválido em
 * `settings.timezone` faria `AT TIME ZONE` lançar. O lookup no catálogo do
 * PostgreSQL aceita somente um nome IANA real e degrada com segurança para o
 * fuso padrão do produto.
 */
export const RESTAURANT_TIMEZONE_SQL = `COALESCE(
  (
    SELECT tz.name
      FROM settings cfg
      JOIN pg_timezone_names tz ON tz.name = cfg.timezone
     LIMIT 1
  ),
  'America/Sao_Paulo'
)`;

export const RESTAURANT_LOCAL_NOW_SQL = `(now() AT TIME ZONE ${RESTAURANT_TIMEZONE_SQL})`;

export const RESTAURANT_LOCAL_DATE_SQL = `${RESTAURANT_LOCAL_NOW_SQL}::date`;

/** Hora civil do restaurante, para comparar com colunas PostgreSQL `time`. */
export const RESTAURANT_LOCAL_TIME_SQL = `${RESTAURANT_LOCAL_NOW_SQL}::time`;

/**
 * Instante real correspondente à meia-noite civil de hoje no restaurante.
 *
 * Comparar um `timestamptz` diretamente com `RESTAURANT_LOCAL_DATE_SQL`
 * faria o PostgreSQL reinterpretar a data no timezone da conexão. A segunda
 * aplicação de `AT TIME ZONE` converte a meia-noite local de volta para o
 * instante UTC correto antes da comparação.
 */
export const RESTAURANT_LOCAL_DAY_START_SQL = `(${RESTAURANT_LOCAL_DATE_SQL} AT TIME ZONE ${RESTAURANT_TIMEZONE_SQL})`;

/** Meia-noite civil de `daysAgoExpression` dias atrás, convertida em instante. */
export function restaurantLocalDayStartDaysAgoSql(daysAgoExpression: string): string {
  return `((${RESTAURANT_LOCAL_DATE_SQL} - (${daysAgoExpression})::int) AT TIME ZONE ${RESTAURANT_TIMEZONE_SQL})`;
}

/** Projeta um instante (`timestamptz`) para a data civil configurada. */
export function restaurantLocalDateOfSql(timestampExpression: string): string {
  return `(${timestampExpression} AT TIME ZONE ${RESTAURANT_TIMEZONE_SQL})::date`;
}

/**
 * Converte uma data/hora civil sem timezone para o instante correspondente no
 * restaurante. Os argumentos são expressões SQL internas, nunca input cru.
 */
export function restaurantLocalDateTimeToInstantSql(
  localDateExpression: string,
  localTimeExpression: string,
): string {
  return `((${localDateExpression} + ${localTimeExpression}) AT TIME ZONE ${RESTAURANT_TIMEZONE_SQL})`;
}
