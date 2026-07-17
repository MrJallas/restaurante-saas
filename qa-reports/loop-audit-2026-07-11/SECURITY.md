# Auditoria de segurança — fechamento

## Resultado

- P0 conhecido: **0**.
- Risco alto/P1 conhecido: **1 aceito temporariamente** — CPF sozinho autentica
  o perfil e pode causar account takeover/violação de privacidade.
- HIGH/CRITICAL em dependências: **0**.
- Python `requirements.lock`: **0 vulnerabilidades conhecidas** no
  `pip-audit`.
- NPM produção e árvore completa: **2 MODERATE**, ambas a mesma advisory do
  PostCSS interno do Next, sem correção compatível disponível.
- A cópia vulnerável e duplicada de Webpack foi removida por
  `npm audit fix` sem `--force`; o LOW deixou de existir.

## Fronteiras validadas

| Fronteira | Estado final |
| --- | --- |
| Tenant | slug resolve schema permitido; tokens/rooms/queries não cruzam tenant |
| Customer | bearer opaco e PII nunca usam customerId compartilhado; CPF-only pode emitir o bearer sem prova de posse (risco aceito) |
| Staff | sessão revalidada no DB; papel e autor derivados server-side; revogação invalida sessão/socket |
| Owner/manager | settings owner-only no controller/service/UI; manager recebe 403 |
| QR | HMAC/token, geofence com precedência explícita, request autoritativa e CTA fail-closed |
| WebSocket | handshake autenticado, rooms autorizadas, proxy same-origin e desconexão após revogação |
| Pedidos | ownership por visita/mesa, matriz de transição, idempotência durável e CAS |
| Pagamentos | ownership, escopo individual/mesa, locks e reconciliação de centavos; cliente não confirma em produção |
| LGPD | confirmação out-of-band, lease/CAS, tentativa antiga inofensiva e limpeza multi-store |
| IA | bearer propagado sem confused deputy; LLM não executa erasure nem promete protocolo |

## Dependência moderada aceita

`next@16.2.10` inclui `postcss@8.4.31`, afetado pela advisory de stringify de
CSS. O npm propõe apenas `npm audit fix --force`, que instalaria Next 9.3.3 —
um downgrade incompatível e inseguro operacionalmente. Não foi mascarado nem
forçado. Mitigação atual: CSS é compilado pelo build, sem aceitar stylesheet
arbitrário de usuário; acompanhar uma release de Next que atualize a cópia
interna.

## Login CPF-only aceito temporariamente

`POST /customer/identify` e `POST /customer/welcome` aceitam um CPF cadastrado
mesmo sem o cookie anterior. O token canônico é reutilizado e enviado somente
em cookie HttpOnly. Rate-limit por IP real, isolamento tenant, logs mascarados e
ownership downstream permanecem, mas são contenções: quem conhece o CPF obtém o
perfil completo.

Correção futura: OTP em telefone/e-mail previamente verificado; fallback
presencial por host/gerente; challenge com hash, TTL, uso único, anti-enumeração
e rate-limit por CPF/IP/dispositivo; credenciais por aparelho, rotação/revogação
e invalidação Redis/WS após prova de posse.

## Limites de ambiente

- Compose, PINs demo e endpoints LAN são apenas desenvolvimento.
- Produção precisa secrets manager, TLS, rotação operacional, backup/restore,
  monitoramento e políticas de rede.
- Pix não é PSP; não há claim de PCI ou liquidação real.
- Este relatório não substitui pentest externo, SAST/DAST de pipeline nem
  revisão jurídica LGPD.
