# Decisões de arquitetura e de produto

Esta pasta registra, em ADRs (Architecture Decision Records) no formato MADR curto, as decisões que
um leitor encontra no código e que tiveram alternativa real. Cada ADR diz o problema, o que foi
escolhido, por quê e o custo da escolha.

Os ADRs foram escritos em setembro de 2026, de forma retroativa, a partir do código, das migrations,
do histórico do Git e dos registros do projeto. Por isso a numeração não segue a ordem cronológica: a
data de cada decisão está no cabeçalho do ADR e na tabela abaixo. Quando a data da decisão e a do
commit que a implementou divergem, o ADR cita as duas.

**Tipo**: _produto_ é o que o sistema faz para quem usa; _engenharia_ é como ele é construído.

## Índice

| Nº   | Decisão                                                                                                                                | Tipo                 | Status | Data       |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------ | ---------- |
| 0001 | [Isolar cada restaurante em um schema do Postgres](0001-isolar-cada-restaurante-em-um-schema-do-postgres.md)                           | engenharia           | aceita | 2026-04-10 |
| 0002 | [Usar Postgres, Redis e MongoDB com papéis separados](0002-usar-postgres-redis-e-mongodb-com-papeis-separados.md)                      | engenharia           | aceita | 2026-05-08 |
| 0003 | [Separar o serviço de IA e responder sem LLM quando possível](0003-separar-o-servico-de-ia-e-responder-sem-llm-quando-possivel.md)     | engenharia           | aceita | 2026-04-15 |
| 0004 | [Validar o primeiro scan do QR na recepção](0004-validar-o-primeiro-scan-do-qr-na-recepcao.md)                                         | produto              | aceita | 2026-05-18 |
| 0005 | [Deixar o cliente-anfitrião aprovar quem chega depois](0005-deixar-o-cliente-anfitriao-aprovar-quem-chega-depois.md)                   | produto              | aceita | 2026-06-09 |
| 0006 | [Aceitar login do cliente só por CPF, temporariamente](0006-aceitar-login-do-cliente-so-por-cpf-temporariamente.md)                    | produto              | aceita | 2026-07-11 |
| 0007 | [Proteger sessões com token derivado e BFF da equipe](0007-proteger-sessoes-com-token-derivado-e-bff-da-equipe.md)                     | engenharia           | aceita | 2026-07-05 |
| 0008 | [Manter o Pix como demonstração](0008-manter-o-pix-como-demonstracao.md)                                                               | produto              | aceita | 2026-07-04 |
| 0009 | [Excluir dados pessoais só por ação explícita do cliente](0009-excluir-dados-pessoais-so-por-acao-explicita-do-cliente.md)             | produto              | aceita | 2026-07-11 |
| 0010 | [Aplicar migrations idempotentes no boot e falhar se quebrarem](0010-aplicar-migrations-idempotentes-no-boot-e-falhar-se-quebrarem.md) | engenharia           | aceita | 2026-05-09 |
| 0011 | [Calcular taxa de serviço e rateio da mesa no backend](0011-calcular-taxa-de-servico-e-rateio-da-mesa-no-backend.md)                   | produto e engenharia | aceita | 2026-07-04 |
| 0012 | [Adotar o V20 como canon visual e congelar telas do cliente](0012-adotar-o-v20-como-canon-visual-e-congelar-telas-do-cliente.md)       | produto              | aceita | 2026-05-09 |

Em ordem cronológica: 0001, 0003, 0002, 0010, 0012, 0004, 0005, 0008, 0011, 0007, 0006 e 0009.

## Decisões descritas em outros documentos

Regra de comportamento de uma funcionalidade fica no documento dela, não num ADR. Estas decisões
estão registradas assim:

| Decisão                                                                                 | Onde está                                                                                                                                                                            |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bancos e serviço de IA sem porta publicada; acesso de desenvolvimento por `docker exec` | [Visão geral da arquitetura](../arquitetura/visao-geral.md) e [Modelo de segurança](../seguranca/modelo-de-seguranca.md)                                                             |
| "Desisti" é diferente de "fui recusado" na entrada da mesa                              | [ADR 0005](0005-deixar-o-cliente-anfitriao-aprovar-quem-chega-depois.md) e [Cliente-anfitrião e mesa compartilhada](../produto/funcionalidades/cliente-host-e-mesa-compartilhada.md) |
| Item do pedido resolvido por nome só quando não há ambiguidade                          | [Serviço de IA](../arquitetura/servico-de-ia.md)                                                                                                                                     |
| Chips de sugestão definidos no backend, com cobertura testada                           | [Serviço de IA](../arquitetura/servico-de-ia.md)                                                                                                                                     |
| Prioridade da cozinha: urgência, depois VIP, depois normal                              | [Ciclo do pedido](../arquitetura/ciclo-do-pedido.md) e [Cliente VIP](../produto/funcionalidades/cliente-vip.md)                                                                      |
| Roteamento da entrega para o garçom                                                     | [Ciclo do pedido](../arquitetura/ciclo-do-pedido.md)                                                                                                                                 |
| Tarefas periódicas: mesa inativa liberada e alertas expirados                           | [Visão geral da arquitetura](../arquitetura/visao-geral.md)                                                                                                                          |
| A nota do pedido conta para o garçom que entregou                                       | [Avaliação e reclamação](../produto/funcionalidades/avaliacao-e-reclamacao.md)                                                                                                       |
| Next.js 16 mantendo React 18                                                            | [ADR 0012](0012-adotar-o-v20-como-canon-visual-e-congelar-telas-do-cliente.md) e [Riscos aceitos e pendências](../seguranca/riscos-aceitos-e-pendencias.md)                          |
| PIN da equipe com bcrypt                                                                | [Modelo de segurança](../seguranca/modelo-de-seguranca.md) e [Staging](../operacao/staging.md)                                                                                       |
| Staging com dois restaurantes (demonstração e beta), sem cadastro self-service          | [Staging](../operacao/staging.md)                                                                                                                                                    |
| Botão sem backend real é defeito                                                        | [Convenções](../desenvolvimento/convencoes.md)                                                                                                                                       |
| Dono tem tudo o que o gerente tem, e mais                                               | [Jornadas e telas](../produto/jornadas-e-telas.md) e [Modelo de segurança](../seguranca/modelo-de-seguranca.md)                                                                      |

Ficaram fora uma ordem de prioridade de trabalho (processo, sem efeito verificável no código) e
recomendações que não chegaram a ser decididas, como a de hospedagem em nuvem. O projeto não tem
implantação em produção.

## Como propor um ADR

1. Use o próximo número livre. Número não se reaproveita, nem de ADR rejeitado.
2. Nome do arquivo: `NNNN-decisao-no-imperativo.md`, em minúsculas e sem acento.
3. Copie o modelo abaixo. Um ADR cabe em uma página; detalhe de implementação vai para `docs/`.
4. `date` é a data da decisão, com evidência (commit, migration ou registro). Para achar a data de
   criação de um arquivo: `git log --diff-filter=A --format='%h %ad' --date=short -- <arquivo>`.
5. "Opções consideradas" só entra quando houve comparação real.
6. ADR aceito não é reescrito. Mudou a decisão? Escreva um ADR novo e troque o status do antigo para
   `substituída por NNNN`.
7. No mesmo commit, atualize este índice e o documento da funcionalidade afetada.

## Modelo

```markdown
---
status: aceita # proposta | aceita | rejeitada | obsoleta | substituída por NNNN
date: AAAA-MM-DD # data da decisão, com evidência (commit, migration, registro)
decision-makers: Nome de quem decidiu
---

# <decisão no imperativo>

## Contexto e problema

## Opções consideradas

## Decisão

Escolhida: "...", porque ...

### Consequências

- Boa, porque ...
- Ruim, porque ...

## Mais informações
```
