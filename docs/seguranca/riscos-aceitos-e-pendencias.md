# Riscos aceitos e pendências

Esta página lista o que é conhecido e ainda não está resolvido, separando o que foi **aceito de
propósito** do que é **pendência**. As proteções que existem estão em
[Modelo de segurança](modelo-de-seguranca.md).

## Riscos aceitos

### Login do cliente só por CPF (risco alto)

Desde 2026-07-11, informar um CPF já cadastrado autentica aquele perfil, mesmo em aparelho novo ou
sem cookie de reconhecimento (`welcome` e `identify` em
`apps/api/src/modules/customers/customers.service.ts`). O motivo e a saída prevista estão em
[ADR 0006](../decisoes/0006-aceitar-login-do-cliente-so-por-cpf-temporariamente.md).

- **Risco.** CPF identifica, mas não é segredo. Quem souber o CPF de alguém assume o perfil: vê o
  histórico e os dados pessoais e pode executar as ações pessoais do cliente, inclusive o pedido de
  exclusão LGPD. É uma tomada de conta de alta severidade.
- **O que continua valendo.** Limite de tentativas por IP real, token só em cookie httpOnly,
  isolamento por restaurante e checagem de dono nas rotas pessoais. Nada disso prova posse do CPF.
- **Comportamento.** Os aparelhos que entram com o mesmo CPF compartilham o mesmo token. Logout em
  qualquer um troca o token, e os outros aparelhos perdem o acesso. Cada entrada por CPF gera o evento de auditoria
  `customer_cpf_only_login_accepted`, com o CPF mascarado e sem nome nem token.
- **Classificação.** Por causa deste risco, a auditoria de 2026-07-11 fechou como **PARTIAL**, e não
  PASS ([relatório](../archive/qa/2026-07-11-auditoria-integral/FINAL-REPORT.md)).

### Pix de demonstração

O Pix não cobra dinheiro; o pagamento para em `awaiting_settlement`. É decisão de produto
([ADR 0008](../decisoes/0008-manter-o-pix-como-demonstracao.md);
[Pagamento e Pix](../produto/funcionalidades/pagamento-pix.md)).

### TVs sem PIN em desenvolvimento

Sem `TV_ACCESS_PIN`, as TVs da cozinha e do bar abrem sem PIN no ambiente de desenvolvimento, que é
o padrão do `docker-compose.yml`. Em produção ou staging a falta do PIN bloqueia as TVs.

### Advisories moderadas do PostCSS interno do Next 16

Na auditoria de 2026-07-11, o `npm audit` apontou 2 advisories de severidade moderada, as duas na
cópia do PostCSS que o Next 16 traz embutida. A única correção sugerida pelo npm é `npm audit fix
--force`, que instalaria uma versão muito antiga do Next. A decisão foi não forçar e acompanhar uma
versão do Next que atualize a cópia interna. A exposição é baixa: o CSS é compilado no build e o
sistema não aceita folha de estilo enviada por usuário. Estado atual das advisories: `[NÃO
VERIFICADO: npm audit não foi rodado nesta revisão]`.

## Pendências

| Pendência                              | Situação                                                                                                                                                                                                                                                                                                                                                                                                   | Onde olhar                                                                                                                  |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Prova de posse para o login do cliente | Trocar o login só por CPF por código de uso único (OTP) enviado a telefone ou e-mail já verificado, com hash, prazo, limite de tentativas e resposta que não revele se o CPF existe; sem canal verificado, recuperação presencial pela recepção ou gerente. Depois: credencial por aparelho, revogação dos tokens antigos, invalidação no Redis e no WebSocket, e o modo só-CPF desligado por configuração | [ADR 0006](../decisoes/0006-aceitar-login-do-cliente-so-por-cpf-temporariamente.md)                                         |
| Provedor de push                       | `PushService` responde `provider_not_configured`; convite de avaliação e avisos não saem do sistema                                                                                                                                                                                                                                                                                                        | `apps/api/src/modules/jobs/push.service.ts`; [Avaliação e reclamação](../produto/funcionalidades/avaliacao-e-reclamacao.md) |
| `QR_HMAC_SECRET`                       | O `docker-compose.yml` define um valor fixo de exemplo que nenhum código lê. O segredo real do QR fica por mesa, em `tables.qr_hmac_secret`                                                                                                                                                                                                                                                                | `docker-compose.yml`, serviço `api`                                                                                         |
| Caminho de produção                    | Não há deploy: o compose roda em modo de desenvolvimento (`NODE_ENV=development`, servidores com recarga automática), só o serviço de IA tem Dockerfile e não há backup nem monitoramento. O checklist de staging lista os segredos exigidos                                                                                                                                                               | [Staging](../operacao/staging.md)                                                                                           |
| Advisories de dependências             | Reavaliar a cada atualização; Python com `pip-audit` sobre os locks                                                                                                                                                                                                                                                                                                                                        | [Convenções](../desenvolvimento/convencoes.md)                                                                              |
| Relatório de violação de CSP           | A CSP está aplicada com nonce; em produção sem `unsafe-eval`. Falta um endpoint de coleta de relatórios para observar violações antes de um lançamento                                                                                                                                                                                                                                                     | `apps/web-*/src/proxy.ts`                                                                                                   |

## Itens fechados

| Data       | O que foi fechado                                                                                                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-05 | PIN da equipe com bcrypt, com migração automática do hash antigo no login                                                                                                          |
| 2026-07-04 | Sessão da equipe no servidor: cookie httpOnly e chave de serviço fora do código do navegador ([ADR 0007](../decisoes/0007-proteger-sessoes-com-token-derivado-e-bff-da-equipe.md)) |
| 2026-07-05 | Token de sessão do cliente separado do id da sessão (HMAC com `SESSION_TOKEN_SECRET`); o id passou a poder aparecer em qualquer resposta                                           |
| 2026-07-05 | Rotas de mesas adjacentes e de junção deixaram de devolver o id da sessão de outra mesa ao cliente                                                                                 |
| 2026-07-05 | CSP aplicada com nonce nos dois apps; `Permissions-Policy` por app; `X-Powered-By` desligado; `middleware.ts` renomeado para `proxy.ts` (Next 16)                                  |
| 2026-07-05 | `ws` atualizado para 8.21 (duas advisories), sem override                                                                                                                          |
| 2026-07-05 | Desbloqueio de TV não aceita mais `X-Forwarded-For` forjado; redirecionamento de `/cozinha/unlock` só para caminho interno                                                         |
| 2026-07-05 | O LLM não decide mais a entrada de alguém na mesa: toda proposta dele é descartada; decisão só pela frase literal do anfitrião ou pelo toque no app                                |
| 2026-07-05 | Dados de usuário nas instruções ao LLM tratados como dado literal                                                                                                                  |
| 2026-07-05 | Troca obrigatória de PIN também exigida no handshake do WebSocket                                                                                                                  |
| 2026-07-11 | Exclusão LGPD com lease e token de tentativa (migration 079); troca do token e desconexão dos sockets. Validado na auditoria de 2026-07-11 e commitado em 2026-07-17               |

## Correções em relação ao texto antigo

A versão anterior deste documento tinha trechos que não batem mais com o código:

| Texto antigo                                                                          | Código atual                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "CSP em `Content-Security-Policy-Report-Only`"                                        | A CSP é **aplicada** com nonce por requisição (`src/proxy.ts` de cada app); o modo só-relatório foi a etapa anterior                                                                                      |
| A ferramenta `lgpd_data_request` distinguia "backend chamado" e podia gerar protocolo | A ferramenta **nunca** chama o backend, nunca cria protocolo e nunca afirma exclusão; devolve só uma ação para o app ([Histórico de chat e LGPD](../produto/funcionalidades/historico-de-chat-e-lgpd.md)) |
| `SESSION_TOKEN_SECRET` "cai no default de dev"                                        | O compose exige a variável; a API recusa valores padrão públicos em qualquer ambiente e exige a variável em produção                                                                                      |
