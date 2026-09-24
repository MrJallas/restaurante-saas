# Validações — prompt 100 (2026-06-12)
# Worktree: claude/compassionate-haslett-5b2f60 · stack docker dev no repo base (detached checkout do commit da branch)

[tsc] npm exec --workspace @restaurant/api -- tsc --noEmit -p tsconfig.json ............ OK
[tsc] npm exec --workspace @restaurant/web-customer -- tsc --noEmit -p tsconfig.json ... OK
[tsc] npm exec --workspace @restaurant/web-staff -- tsc --noEmit -p tsconfig.json ...... OK
[pytest] python3 -m pytest services/ai-service/tests -q ................................ 295 passed
         (inclui test_rule_layer_phrases.py — 40 frases + followup gerente — e
          test_tools_registry.py::test_chips_coverage_at_least_9_of_10_mutations)
[jest] npm test --workspace @restaurant/api ............................................ 36 passed (5 suites)
       (round17-contract, qr-code.service, alerts.service migrados;
        continuation.service.test.ts = matriz de consumo; controller = supertest)
[build] npm run build (turbo: shared-types, api, web-customer, web-staff) ............. 4/4 successful (22.9s)
[e2e] npx playwright test assistente-context tv-delivery-flow tv-kds tv-coverage ...... 51 passed (1.6m, serial, projeto iphone-14/WebKit)
      assistente-context.spec.ts:
        ✓ matriz de contexto: eyebrow de status + mensagem consumível 1x + WS ao vivo
        ✓ chip/frase direta: rule-layer sem LLM com UX de IA (indicador + chips coerentes)
        ✓ resposta do gerente é privada: só o destinatário vê (realtime + reload)
[git] git diff --check ................................................................. OK
