# Visão geral do produto

O restauranteSaaS é um sistema para restaurantes com atendimento no salão. O cliente escaneia o QR
Code da mesa, se identifica e usa o celular para pedir, chamar o garçom, reclamar e pagar, por
telas e por um assistente de IA. A equipe acompanha tudo em tempo real no próprio app: recepção,
garçom, cozinha, bar, gerente e dono. É um projeto acadêmico, em funcionamento no ambiente de
desenvolvimento e sem implantação pública.

## Problema

- **A casa não sabe quem sentou em qual mesa.** Um QR impresso pode ser fotografado e usado de fora.
  Aqui, nenhuma mesa livre abre sem a recepção confirmar a primeira pessoa que escaneou.
- **Pedido, chamado e conta dependem do garçom passar na mesa.** Com o celular, o cliente pede e
  chama quando quiser, e as telas da equipe reagem na hora.
- **Gestão sem dado.** O gerente vê a ocupação do salão, a fila de cada estação, a carga de cada
  garçom, os pedidos atrasados, as reclamações e a linha do tempo de cada mesa, tudo calculado no
  servidor.
- **IA sem improviso onde é crítico.** O assistente ajuda no pedido, mas alergia, entrada na mesa e
  exclusão de dados não dependem do que o LLM decide.

## Para quem

Um restaurante (no sistema, um _tenant_) com salão e equipe. Cada restaurante tem os próprios dados,
separados dos outros.

| Persona           | App                                                  | O que faz                                                                                              |
| ----------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Cliente na mesa   | App do cliente (porta 3003)                          | Escaneia o QR, se identifica, pede, acompanha, chama o garçom, reclama, recebe cortesia, divide e paga |
| Cliente-anfitrião | App do cliente                                       | O primeiro cliente aprovado da mesa. Aprova quem chega depois e responde a pedidos de junção de mesas  |
| Recepção          | App da equipe, `/host`                               | Confere o primeiro scan de cada mesa livre, libera e troca mesas, cuida de fila de espera e reservas   |
| Garçom            | `/waiter`                                            | Atende chamados, leva pedidos prontos, lança pedido direto                                             |
| Cozinha e bar     | `/cozinha`, `/bar` e as TVs `/cozinha/tv`, `/bar/tv` | Preparam os itens da própria estação na ordem de prioridade e chamam o garçom quando fica pronto       |
| Gerente           | `/manager`                                           | Operação do salão, equipe e turnos, pausa de garçom, VIP, reclamações, cortesias, indicadores          |
| Dono              | `/manager` e `/manager/estabelecimento`              | Tudo o que o gerente faz, mais as configurações do estabelecimento                                     |

As rotas de cada persona estão em [Jornadas e telas](jornadas-e-telas.md).

## Uma noite no restaurante

1. **A equipe entra.** Cada funcionário faz login com CPF e PIN no app da equipe e cai na tela do
   seu papel. A recepção fica em `/host`.
2. **O primeiro cliente chega.** Escaneia o QR da mesa, permite a localização, informa nome e CPF e
   fica na tela "Esperando aprovação".
3. **A recepção confere.** O card "Verificar mesa escaneada" aparece em `/host`; a recepção olha a
   mesa e aprova. A espera some sozinha e esse cliente vira o cliente-anfitrião. (Se a recepção
   liberou a mesa antes, o primeiro scan entra direto.)
4. **Os amigos chegam.** Quem escaneia a mesa depois espera a aprovação do cliente-anfitrião, não da
   equipe.
5. **O pedido.** Pelo cardápio ou pelo assistente, cada item vai para a comanda da mesa ou para a
   comanda individual. Depois de enviar, o cliente tem 15 s para desistir; então o pedido aparece na
   fila da cozinha e do bar.
6. **O preparo.** Cada estação prepara os próprios itens. O cliente acompanha o estado e a
   estimativa de tempo pelo celular.
7. **A entrega.** Com tudo pronto, a cozinha toca "Chamar garçom"; o sistema escolhe o garçom da
   zona que está em turno e sem pausa. Ele toca "Estou levando" e, na mesa, "Confirmar entrega".
8. **A conta.** O cliente vê a conta com a taxa de serviço calculada no servidor, divide com a mesa
   e paga pelo Pix de demonstração. Depois pode avaliar o pedido.

Ao longo da noite, o cliente chama o garçom, reclama ou recebe uma cortesia, e o gerente acompanha
pelo mapa, pelos alertas e pela carga da equipe.

## Funcionalidades

| Tema                                                      | Página                                                                                         |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Quem aprova quem entra na mesa; junção de mesas           | [Cliente-anfitrião e mesa compartilhada](funcionalidades/cliente-host-e-mesa-compartilhada.md) |
| Conta, divisão, taxa de serviço e Pix                     | [Pagamento e Pix](funcionalidades/pagamento-pix.md)                                            |
| Cerca geográfica                                          | [Geolocalização](funcionalidades/geolocalizacao.md)                                            |
| Avaliação do pedido e reclamação                          | [Avaliação e reclamação](funcionalidades/avaliacao-e-reclamacao.md)                            |
| Histórico do assistente e exclusão de dados               | [Histórico de chat e LGPD](funcionalidades/historico-de-chat-e-lgpd.md)                        |
| Prioridade VIP                                            | [Cliente VIP](funcionalidades/cliente-vip.md)                                                  |
| Aliviar um garçom sobrecarregado                          | [Pausa de zona](funcionalidades/pausa-de-zona.md)                                              |
| Estados do pedido, estações, estimativa de tempo, entrega | [Ciclo do pedido](../arquitetura/ciclo-do-pedido.md)                                           |
| O assistente de IA e o que acontece sem LLM               | [Serviço de IA](../arquitetura/servico-de-ia.md)                                               |

## O que ainda não está pronto

| Item                                                      | Situação                                                                                                                                                        |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pix                                                       | Demonstração: nenhum valor é cobrado e o pagamento para em "aguardando compensação" ([ADR 0008](../decisoes/0008-manter-o-pix-como-demonstracao.md))            |
| Cartão e dinheiro                                         | Cartão saiu da lista de pagamento; não há opção de dinheiro                                                                                                     |
| Caixa                                                     | `/cashier` é só um aviso de "caixa ainda não ativado"; não há liquidação presencial                                                                             |
| Push                                                      | Não há provedor de notificação push: o convite de avaliação e os avisos fora do app não saem                                                                    |
| Aviso à recepção depois da aprovação do cliente-anfitrião | Não existe: a equipe não fica sabendo que alguém entrou numa mesa ocupada                                                                                       |
| Verificação do primeiro scan depois de 60 s               | O pedido sobe para o gerente e depois para o garçom, mas só a recepção tem tela de aprovação, e ela já não pode aprovar nesse nível `[NÃO VERIFICADO em uso]`   |
| Junção de mesas                                           | O acordo é registrado, mas as duas mesas continuam com sessões e contas separadas, e o mapa não as mostra juntas                                                |
| Recuperação de PIN                                        | Não há canal de entrega do código (SMS ou e-mail)                                                                                                               |
| Login do cliente                                          | Só por CPF, risco aceito temporariamente ([ADR 0006](../decisoes/0006-aceitar-login-do-cliente-so-por-cpf-temporariamente.md))                                  |
| Seed de demonstração                                      | Não cria usuários de bar nem de caixa; também não configura a meta de preparo da cozinha, então a lista de pedidos atrasados fica vazia até a cozinha ajustá-la |
| Implantação                                               | Não há ambiente de produção: o compose é de desenvolvimento ([Staging](../operacao/staging.md))                                                                 |

Riscos aceitos e pendências de segurança:
[Riscos aceitos e pendências](../seguranca/riscos-aceitos-e-pendencias.md).

## Glossário

| Termo                           | Significado                                                                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Tenant                          | Um restaurante no sistema. Tem um schema próprio no PostgreSQL e é identificado na URL por um _slug_ (no ambiente local, `restaurant_dev`) |
| Mesa                            | Mesa física, com código (`M01`…) e um QR permanente                                                                                        |
| Sessão da mesa                  | A ocupação atual de uma mesa, do primeiro scan até o fechamento. No máximo uma ativa por mesa                                              |
| Participante                    | Cliente identificado dentro de uma sessão: pendente, aprovado, recusado ou desistente                                                      |
| Cliente-anfitrião               | O primeiro cliente aprovado da sessão; decide quem entra e responde a pedidos de junção                                                    |
| Recepção                        | O papel de equipe `host`. Não confundir com o cliente-anfitrião                                                                            |
| Comanda da mesa × minha comanda | Cada item pedido vai para a conta compartilhada da mesa ou para a conta individual de quem pediu                                           |
| KDS                             | _Kitchen display system_: a tela de fila de preparo da cozinha ou do bar                                                                   |
| Estação                         | Cozinha ou bar. Bebidas vão para o bar; o resto, para a cozinha                                                                            |
| ETA                             | Estimativa de tempo até o pedido chegar, mostrada ao cliente                                                                               |
| Chamado de garçom               | Pedido do cliente para um garçom ir à mesa, com motivo                                                                                     |
| Cortesia                        | Item ou benefício que o gerente oferece a um cliente                                                                                       |
| Pausa de zona                   | Pausa de um garçom: ele deixa de receber entregas por alguns minutos                                                                       |
