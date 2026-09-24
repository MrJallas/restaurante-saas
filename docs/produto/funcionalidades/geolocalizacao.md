# Geolocalização (cerca geográfica)

## Para que serve

O QR da mesa é permanente e pode ser fotografado. A cerca geográfica é uma barreira extra para quem
tenta entrar de fora do restaurante: com ela ligada, a API só aceita a identificação do cliente se a
localização informada pelo navegador estiver dentro de um raio em volta do restaurante. A barreira
principal continua sendo a verificação do primeiro scan pela recepção
([ADR 0004](../../decisoes/0004-validar-o-primeiro-scan-do-qr-na-recepcao.md)).

## Duas camadas

| Camada         | O que faz                                                                                                                                                             | Onde                                                                                                                           |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| App do cliente | **Sempre** pede a localização antes da identificação. Sem permissão concedida, mostra "Permita o acesso à localização para entrar no app do restaurante." e não segue | `apps/web-customer/src/app/[slug]/mesa/[tableCode]/page.tsx`, `src/components/welcome/WelcomeModal.tsx`, `src/lib/location.ts` |
| API            | Só confere distância quando a cerca está **ligada**. Desligada, não valida nada                                                                                       | `apps/api/src/common/utils/geofence.ts`                                                                                        |

Com a cerca ligada, `POST /:slug/customer/welcome` e `POST /:slug/customer/recognize` chamam
`evaluateCustomerGeofence` (`apps/api/src/modules/customers/customers.service.ts`):

- sem permissão de localização: 403 "Permita o acesso à localização…";
- coordenadas ilegíveis: 400;
- sem ponto do restaurante configurado: aceita e não mede distância;
- fora do raio: 403 "Você está fora da área do restaurante (N m de distância). Aproxime-se da mesa
  para entrar.".

A distância é calculada pela fórmula de haversine. A verificação do primeiro scan também guarda a
distância e se o cliente estava dentro do raio, para a recepção ver no card
(`scan-verification.service.ts`). `POST /:slug/customer/identify` (entrada pelo CPF em tela pessoal)
não passa pela cerca.

## Onde se configura

Por restaurante, na tabela `settings` do schema do tenant:

| Coluna                                    | Migration | Padrão                                                     |
| ----------------------------------------- | --------- | ---------------------------------------------------------- |
| `geofence_latitude`, `geofence_longitude` | 050       | vazio                                                      |
| `geofence_radius_meters`                  | 050       | 3                                                          |
| `geofence_enabled`                        | 074       | `false` (ligada só onde já havia coordenadas antes da 074) |

O dono edita esses valores em `/manager/estabelecimento` (tela
`ScreenOwnerEstablishmentSettings.tsx`, só para o papel `owner`), pela rota
`PATCH /:slug/settings/establishment`.

## Variáveis de ambiente

As variáveis abaixo, lidas pela API, têm prioridade sobre a tabela `settings` (mesma lógica em
`customers.service.ts` e `scan-verification.service.ts`):

| Variável                                                   | Efeito                                 |
| ---------------------------------------------------------- | -------------------------------------- |
| `CUSTOMER_GEOFENCE_ENABLED`                                | `true`/`false` força ligar ou desligar |
| `CUSTOMER_GEOFENCE_LATITUDE`                               | latitude do restaurante                |
| `CUSTOMER_GEOFENCE_LONGITUDE` (ou `CUSTOMER_GEOFENCE_LON`) | longitude do restaurante               |
| `CUSTOMER_GEOFENCE_RADIUS_METERS`                          | raio em metros                         |

O `docker-compose.yml` não define nenhuma delas.

## Desligada por padrão no ambiente de desenvolvimento

O seed de demonstração não grava coordenadas e a coluna `geofence_enabled` nasce `false`. No ambiente
local a API não confere distância. O app do cliente, porém, continua pedindo a permissão de
localização.

## Localização sintética em HTTP de rede local

Pelo celular, o app é aberto por `http://<IP-da-LAN>:3003`. Nessa origem o navegador (em especial o
Safari do iOS) não oferece a localização real, porque ela exige contexto seguro. Para o
desenvolvimento, `NEXT_PUBLIC_ALLOW_INSECURE_LAN_GEOLOCATION=true` (padrão do compose e do
`.env.example`) faz o app do cliente criar uma localização concedida sintética, sem perguntar
(`apps/web-customer/src/lib/location.ts`), quando:

- a página não é um contexto seguro; e
- o endereço é privado: faixas IPv4 `10/8`, `127/8`, `172.16/12` e `192.168/16`, `localhost` ou
  nomes `*.local`.

As coordenadas sintéticas vêm de `NEXT_PUBLIC_DEV_GEOLOCATION_LATITUDE`, `_LONGITUDE` e
`_ACCURACY_METERS` (padrão 0, 0 e 9999; o compose não as define). Em `http://localhost:3003` o
navegador trata a página como segura, então o atalho não age e a permissão real é pedida.

## Limites

- A localização vem do navegador e pode ser forjada por quem controla o aparelho. A cerca dificulta
  o uso casual do QR fora do restaurante; não prova presença.
- Raio padrão de 3 m é pequeno para GPS de celular dentro de um prédio. O dono deve ajustá-lo antes de
  ligar a cerca.
- Com a localização sintética (0, 0), ligar a cerca com coordenadas reais bloqueia quem entra pela
  rede local.
- A tela do dono registra cada mudança em `settings_audit_log` (quem mudou, antes e depois; migration
  074). Mudanças feitas por variável de ambiente não passam por essa trilha.

## Divergências com o texto antigo

A versão anterior deste documento citava `GEOFENCE_RADIUS_METERS`, `GEOFENCE_RESTAURANT_LAT`,
`GEOFENCE_RESTAURANT_LNG` e colunas `restaurant_lat`/`restaurant_lng`. Nenhum desses nomes existe no
código; os nomes reais são os `CUSTOMER_GEOFENCE_*` e `settings.geofence_*` acima. A "tela do gerente
como próximo passo" também já existe, como tela do dono.

## Referências de código

- `apps/api/src/common/utils/geofence.ts`
- `apps/api/src/modules/customers/customers.service.ts` (`validateCustomerLocation`,
  `readGeofenceConfig`)
- `apps/api/src/modules/scan-verification/scan-verification.service.ts`
- `apps/web-customer/src/lib/location.ts`
- `packages/database/migrations/tenant-template/050_customer_geofence_and_fee.sql` e
  `074_owner_establishment_settings.sql`
- Configuração do ambiente: [Ambiente local](../../desenvolvimento/ambiente-local.md)
