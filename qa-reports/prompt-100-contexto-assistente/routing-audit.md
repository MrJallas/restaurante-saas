# Auditoria de roteamento do rule-layer — 59 frases (2026-06-13, LLM local ligado)

Pergunta do Caleb: além de alergia, conferir se as frases vão pro LLM no
contexto certo ou se bugam e caem no filtro errado. Probe direto no
ai-service /chat (campo `layer` cru). 503 do LLM conta como 'roteou pro LLM'.

RESULTADO: 57/59 corretos. 0 misroute perigoso (nada que precisa de
raciocínio foi engolido por uma rule; toda restrição alimentar foi pro LLM).
Os 2 mismatches são acks ("sim", "beleza, valeu") indo pro LLM em vez do
atalho ack — direção SEGURA (resposta real, não enlatada). Não é bug de
segurança; opcional adicionar 'sim' aos _ACK_TOKENS + tratar ack composto.

```
CAT                    FRASE                                                    ESPERADO                         ATUAL                            TOOL                 VERDITO
A.menu                 ver cardápio                                              rule-view-menu                   rule-view-menu                   view_menu            OK
A.menu                 quero ver o cardápio                                      rule-view-menu                   rule-view-menu                   view_menu            OK
A.menu                 abre o menu                                              rule-view-menu                   rule-view-menu                   view_menu            OK
A.menu                 cardápio                                                  rule-view-menu                   rule-view-menu                   view_menu            OK
A.menu                 mostra as bebidas                                        rule-view-menu                   rule-view-menu                   view_menu            OK
A.menu                 ver as sobremesas                                        rule-view-menu                   rule-view-menu                   view_menu            OK
A.menu                 quais entradas tem?                                      rule-view-menu                   rule-view-menu                   view_menu            OK
A.menu                 mostra os pratos principais                              rule-view-menu                   rule-view-menu                   view_menu            OK
B.rec                  me indica algo                                           rule-recommend-dish              rule-recommend-dish              recommend_dish       OK
B.rec                  me indica algo leve                                      rule-recommend-dish              rule-recommend-dish              recommend_dish       OK
B.rec                  o que você recomenda?                                     rule-recommend-dish              rule-recommend-dish              recommend_dish       OK
B.rec                  me recomenda alguma coisa                                rule-recommend-dish              rule-recommend-dish              recommend_dish       OK
B.rec                  me indica uma sobremesa                                  rule-recommend-dish              rule-recommend-dish              recommend_dish       OK
C.diet                 me indica algo sem camarão                                llm                              llm                              -                    OK
C.diet                 me indica algo sem lactose                               llm                              llm                              -                    OK
C.diet                 me recomenda algo vegano                                 llm                              llm                              -                    OK
C.diet                 sugere algo sem amendoim                                 llm                              llm                              -                    OK
C.diet                 me indica algo sem cebola                                llm                              llm                              -                    OK
C.diet                 me indica um prato pra quem é alérgico                     llm                              llm                              -                    OK
C.diet                 me indica algo sem ser muito pesado                      llm                              llm                              -                    OK
D.order                cadê meu pedido?                                          rule-order-status                rule-order-status                view_order           OK
D.order                quanto tempo demora o pedido?                            rule-order-status                rule-order-status                view_order           OK
D.order                ver meu pedido                                           rule-order-status                rule-order-status                view_order           OK
D.order                qual o status do meu pedido?                             rule-order-status                rule-order-status                view_order           OK
E.pay                  traz a conta                                             rule-payment                     rule-payment                     open_payment_screen  OK
E.pay                  quero pagar                                              rule-payment                     rule-payment                     open_payment_screen  OK
E.pay                  a conta, por favor                                       rule-payment                     rule-payment                     open_payment_screen  OK
E.pay                  quero dividir a conta                                    rule-payment                     rule-payment                     split_bill           OK
E.pay                  quero pagar só a minha parte                              rule-payment                     rule-payment                     pay_individual       OK
E.pay                  quero pagar tudo                                         rule-payment                     rule-payment                     pay_full             OK
E.pay                  quero finalizar                                          rule-payment                     rule-payment                     open_payment_screen  OK
F.waiter               chama o garçom                                            rule-call-waiter                 rule-call-waiter                 call_waiter          OK
F.waiter               garçom, por favor                                         rule-call-waiter                 rule-call-waiter                 call_waiter          OK
F.waiter               cadê o garçom?                                             rule-call-waiter                 rule-call-waiter                 call_waiter          OK
F.waiter               preciso de um garçom                                      rule-call-waiter                 rule-call-waiter                 call_waiter          OK
G.court                ver minhas cortesias                                     rule-courtesy                    rule-courtesy                    view_courtesy        OK
G.court                tem alguma cortesia?                                     rule-courtesy                    rule-courtesy                    view_courtesy        OK
H.mgr                  quero falar com o gerente                                rule-manager-intent              rule-manager-intent              -                    OK
H.mgr                  chama o gerente                                          rule-manager-intent              rule-manager-intent              -                    OK
I.gluten               opções sem glúten                                           rule-gluten-free-recommendation  rule-gluten-free-recommendation  recommend_dish       OK
I.gluten               me indica algo sem glúten                                 rule-gluten-free-recommendation  rule-gluten-free-recommendation  recommend_dish       OK
I.gluten               tem prato sem glúten?                                     rule-gluten-free-recommendation  rule-gluten-free-recommendation  recommend_dish       OK
J.reason               qual prato combina com vinho tinto?                      llm                              llm                              -                    OK
J.reason               meu pedido veio errado, o que você sugere?                llm                              llm                              -                    OK
J.reason               qual a diferença entre o risoto e o nhoque?               llm                              llm                              -                    OK
J.reason               me fala sobre o restaurante                              llm                              llm                              -                    OK
K.trap-neg             não quero ver o cardápio agora                             llm                              llm                              -                    OK
K.trap-neg             não quero pagar ainda                                     llm                              llm                              -                    OK
K.trap-false           cadê meu amor                                             llm                              llm                              -                    OK
K.trap-long            queria muito ver o cardápio de sobremesas especiais hoje  llm                              llm                              -                    OK
K.trap-mod             tira a cebola do meu prato                               llm                              llm                              -                    OK
K.trap-merge           quero juntar com a mesa 5                                llm                              llm                              -                    OK
K.trap-allergy         tenho alergia a glúten                                    llm                              llm                              -                    OK
K.trap-allergy         sou alérgico a frutos do mar                              llm                              llm                              -                    OK
K.trap-menu-allergy    tem algo sem camarão no cardápio?                          llm                              llm                              -                    OK
L.ack                  sim                                                      ack                              llm                              -                    XXX MISMATCH
L.ack                  obrigado                                                 ack                              ack                              -                    OK
L.ack                  pode ser                                                 ack                              ack                              -                    OK
L.ack                  beleza, valeu                                            ack                              llm                              -                    XXX MISMATCH
TOTAL=59 MISMATCHES=2
```
