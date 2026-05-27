# QA gerente prompt 05

Base: http://localhost:3003
Staff: b629f117-1337-42a0-a08d-591f584ecca5 (manager)
Slug: restaurant_dev

- 01-painel: http://localhost:3003/manager?slug=restaurant_dev&staffId=b629f117-1337-42a0-a08d-591f584ecca5&staffRole=manager | forbidden=[] | hasError=false
- 02-reclamacao-overlay: http://localhost:3003/manager?slug=restaurant_dev&staffId=b629f117-1337-42a0-a08d-591f584ecca5&staffRole=manager&replyComplaint=8c6ea6a6-def9-4c31-9555-961a81b3b35f | forbidden=[] | hasError=false
- 02-reclamacao-quick-reply: http://localhost:3003/manager?slug=restaurant_dev&staffId=b629f117-1337-42a0-a08d-591f584ecca5&staffRole=manager&replyComplaint=8c6ea6a6-def9-4c31-9555-961a81b3b35f | forbidden=[] | hasError=false
- 03-operacoes: http://localhost:3003/manager/operacoes?slug=restaurant_dev&staffId=b629f117-1337-42a0-a08d-591f584ecca5&staffRole=manager | forbidden=[] | hasError=false
- 04-equipe: http://localhost:3003/manager/equipe?slug=restaurant_dev&staffId=b629f117-1337-42a0-a08d-591f584ecca5&staffRole=manager | forbidden=[] | hasError=false
- 05-financeiro: http://localhost:3003/manager/financeiro?slug=restaurant_dev&staffId=b629f117-1337-42a0-a08d-591f584ecca5&staffRole=manager&period=30d | forbidden=[] | hasError=false
- 06-eu: http://localhost:3003/manager/configuracoes?slug=restaurant_dev&staffId=b629f117-1337-42a0-a08d-591f584ecca5&staffRole=manager | forbidden=[] | hasError=false
- 07-table-menu: http://localhost:3003/manager/table-menu/37ce9bb1-1ecf-45c8-9ab5-87b460a693d0?slug=restaurant_dev&staffId=b629f117-1337-42a0-a08d-591f584ecca5&staffRole=manager&tableNumber=1 | forbidden=[] | hasError=false
- 08-cortesias: http://localhost:3003/manager/cortesias?slug=restaurant_dev&staffId=b629f117-1337-42a0-a08d-591f584ecca5&staffRole=manager | forbidden=[] | hasError=false
- 09-notificacoes: http://localhost:3003/manager/notifications?slug=restaurant_dev&staffId=b629f117-1337-42a0-a08d-591f584ecca5&staffRole=manager | forbidden=[] | hasError=false
- 10-seguranca: http://localhost:3003/manager/seguranca?slug=restaurant_dev&staffId=b629f117-1337-42a0-a08d-591f584ecca5&staffRole=manager | forbidden=[] | hasError=false
- 11-aparencia: http://localhost:3003/manager/aparencia?slug=restaurant_dev&staffId=b629f117-1337-42a0-a08d-591f584ecca5&staffRole=manager | forbidden=[] | hasError=false
- 15-table-menu-persisted: http://localhost:3004/manager/mesa/91?slug=restaurant_dev&managerId=b629f117-1337-42a0-a08d-591f584ecca5 | API worktree=http://localhost:3011/api | editou pessoas/observacao, recarregou e manteve o valor vindo do backend | hasError=false
