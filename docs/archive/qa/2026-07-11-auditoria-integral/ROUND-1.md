# Rodada limpa final 1

Base: código final + `package-lock.json` após `npm audit fix` seguro.  
Regra: qualquer edição ou falha reiniciaria a contagem.

| Gate | Resultado |
| --- | --- |
| API Jest | 152/152 suites; 935/935 testes; 23,724 s |
| Web customer Jest | 32/32 suites; 167/167 testes; 1,244 s |
| Web staff Jest | 23/23 suites; 87/87 testes; 0,907 s |
| AI pytest | 408/408; 2,35 s |
| Formato/diff | Prettier PASS; `git diff --check` PASS |
| Lint | Turbo `lint --force`; 5/5 tasks; 0 cache; PASS |
| Build | Turbo `build --force`; 4/4 tasks; 0 cache; PASS |
| Noite Playwright | 1/1; WebKit iPhone 14; 50,3 s (51,1 s total) |

Total de testes de unidade/integração: **1.597**. Nenhum arquivo foi editado
durante a rodada. Teardown: zero sessões, liberações abertas, scans pendentes,
pedidos ativos e chamados ativos em QRTEST91/92.
