# Continuação — Login de staff com superusers para acessar interfaces

## Contexto

Este é o monorepo `restauranteSaaS`. Hoje o `web-staff` depende de `localStorage` ou query params (`staffId`, `managerId`, `hostId`, etc.) para montar `x-staff-id`/`x-staff-role`. Isso serviu para auditoria, mas precisamos de um login funcional para usar as interfaces de gerente, recepcionista, garçom e cozinha sem ficar injetando localStorage manualmente.

Esta entrega é pragmática: criar superusers/usuários de teste reais para acessar as interfaces. Não transformar ainda em auth production-grade completo se isso exigir uma repactuação maior.

Source-of-truth visual:

- `docs/design-canvas-final/handoff/garcom/garcom-screens-a.jsx` (`ScreenLogin`, forgot password)
- `docs/design-canvas-final/handoff/garcom/README.md` seção login/forgot
- `apps/web-staff/src/lib/api.ts`
- `apps/api/src/modules/staff/staff.controller.ts`
- `packages/database/migrations/tenant-template/008_create_staff.sql`
- `packages/database/migrations/tenant-template/041_staff_extended_fields.sql`

Regras gerais:

- Antes de mexer, rode `git status --short` e preserve edições de outros agentes.
- Não reintroduzir bypass de role: `ManagerOnlyGuard`/`HostOrManagerGuard` devem continuar validando staff ativo no DB por `x-staff-id`.
- Logs/históricos novos vão para MongoDB, não Postgres.
- Tokens/códigos temporários devem usar Redis ou MongoDB com TTL, não tabela nova de histórico em Postgres.
- Migrations novas devem ser idempotentes (`DO $$ ... IF NOT EXISTS`).
- Erros para usuário devem ser `{ message_user, code }`, não `x-staff-id inválido`.

## Estado atual já encontrado

- `staff` tem `name`, `role`, `pin_hash`, `is_active` e campos opcionais `cpf`, `phone`, `email`, `default_shift`.
- Seed demo cria staff com PIN `1234`, mas sem CPF.
- Existe `POST /:slug/staff/:id/verify-pin`.
- `apps/web-staff/src/lib/api.ts` lê `staffId` e `staffRole` de query/localStorage e envia headers.
- Não há rota clara `/login`/`/forgot` em `apps/web-staff/src/app`.
- Canvas descreve login por CPF + senha e recuperação em 3 passos, mas o backend atual é PIN.

## Premissa desta entrega

Implementar login funcional de interface usando o modelo existente de staff + PIN:

- CPF identifica o staff.
- PIN atual funciona como senha provisória/senha curta.
- Ao logar, frontend grava `staffId` e `staffRole` no localStorage e navega para a interface correta.
- Superusers de teste são staff reais no tenant, um por role principal.

Se o objetivo for senha real longa/JWT obrigatório agora, pare e pergunte antes de implementar, porque isso muda o escopo de segurança.

## Superusers esperados para dev/demo

Criar seed idempotente para `restaurant_dev`/tenant demo com CPFs fictícios e PIN `1234`:

```txt
Gerente Demo       role=manager cpf=90000000001 pin=1234
Recepcao Demo      role=host    cpf=90000000002 pin=1234
Garcom Demo        role=waiter  cpf=90000000003 pin=1234
Cozinha Demo       role=cook    cpf=90000000004 pin=1234
```

Critérios:

- Se já existir staff com esses CPFs, atualizar nome/role/is_active sem duplicar.
- Não usar CPFs reais.
- Não vazar esses dados em produção se houver seed separado por ambiente.

## Implementação esperada

### 1. Backend auth leve

Criar módulo pequeno, por exemplo `apps/api/src/modules/staff-auth`:

```http
POST /:slug/staff-auth/login
POST /:slug/staff-auth/forgot
POST /:slug/staff-auth/forgot/verify
POST /:slug/staff-auth/reset-pin
```

Login:

```ts
POST /staff-auth/login
body: { cpf: string, pin: string }
return: {
  staff: { id, name, role },
  headers: { staffId, staffRole },
  nextPath: '/manager' | '/host' | '/waiter' | '/cozinha'
}
```

Critérios:

- Normalizar CPF para dígitos.
- Reusar comparação de `pin_hash` existente ou extrair helper seguro de `StaffService.verifyPin`.
- Reusar throttle Redis existente ou criar throttle Redis por CPF/IP.
- Nunca retornar se o CPF existe quando falhar; mensagem genérica.
- Não emitir JWT falso se não houver validação server-side real para ele.

Forgot/reset:

- Para esta fase, implementar fluxo funcional para superusers/dev sem SMS real:
  - `forgot` retorna canais mascarados quando staff tem phone/email, e em dev/test pode retornar `devCode` apenas fora de produção.
  - código/token temporário em Redis ou MongoDB TTL.
  - `reset-pin` altera `pin_hash` e invalida token.
- Em produção sem adapter de SMS/e-mail configurado, retornar mensagem amigável e código estruturado `RECOVERY_CHANNEL_UNAVAILABLE`.

### 2. Frontend web-staff

Criar rotas:

```txt
/login
/forgot
/forgot/verify
/forgot/reset
```

Atualizar `apps/web-staff/src/app/page.tsx` para ir para `/login` ou mostrar botão "Entrar".

Comportamento:

- Form CPF + PIN.
- "Manter conectado" pode apenas manter localStorage; sem marcar, usar sessionStorage se o app já tiver padrão.
- Ao sucesso:
  - salvar `staffId`, `staffRole`, `staffName`;
  - navegar pelo role:
    - `manager` -> `/manager`
    - `host` -> `/host`
    - `waiter` -> `/waiter`
    - `cook` -> `/cozinha`
- Se usuário já está logado, `/login` pode redirecionar para role home.
- Sair deve limpar `staffId`, `staffRole`, `staffName`.

### 3. Compatibilidade com auditoria atual

- Manter query params `staffId`/`managerId`/etc. por enquanto se ainda forem usados pelos testes, mas não depender deles no uso normal.
- Não quebrar `staffIdentityHeaders`.
- Não fazer fallback para role escolhido no frontend sem validar staff no backend.

## Validação mínima

Rodar:

```bash
npm run build -w @restaurant/api
npm run build -w @restaurant/web-staff
git diff --check
```

## Validação automatizada obrigatória

- Usar MCP Playwright/browser para validar `/login`, `/forgot`, `/forgot/verify` e `/forgot/reset` quando implementados.
- Testar os quatro superusers por Playwright, sem injetar `localStorage` manualmente no aceite final:
  - gerente -> `/manager`
  - recepção -> `/host`
  - garçom -> `/waiter`
  - cozinha -> `/cozinha`
- Para cada role, capturar network/headers de uma chamada protegida e confirmar `x-staff-id` e `x-staff-role` corretos.
- Testar PIN errado/throttle e validar erro amigável `{ message_user, code }`.
- Salvar screenshots e resumo em `qa-reports/staff-login-superusers/`.

Fluxo manual:

1. Abrir `/login`.
2. Entrar com `90000000001 / 1234`.
3. Confirmar redirect `/manager` e chamadas com `x-staff-id`.
4. Sair.
5. Entrar com `90000000002 / 1234`, confirmar `/host`.
6. Entrar com `90000000003 / 1234`, confirmar `/waiter`.
7. Entrar com `90000000004 / 1234`, confirmar `/cozinha`.
8. Testar PIN errado e throttle amigável.

## Critérios de aceitação

- [ ] Login por CPF+PIN funciona para superusers.
- [ ] Cada role abre a interface correta.
- [ ] Headers `x-staff-id` e `x-staff-role` continuam corretos.
- [ ] Logout limpa identidade.
- [ ] Forgot/reset tem fluxo dev/test funcional ou erro estruturado em produção sem adapter.
- [ ] Sem bypass de role por localStorage sozinho.
