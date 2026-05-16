# Routes tested · host profile + settings · Round 23

Host Renata (`hostId=a4c89ca7-86e6-4072-9432-449118a62fd4`, role=host) on
`http://localhost:3002`, tenant `restaurant_dev`.

| Route | HTTP | Renders | Source file |
|---|---|---|---|
| `/host/profile?tenant=restaurant_dev&hostId=...&name=Renata` | 200 | `ScreenHostProfile` (h1 "Eu") | `apps/web-staff/src/screens/host/ScreenHostProfile.tsx` |
| `/host/turnos-historico?tenant=...&hostId=...` | 200 | `ScreenHostTurnosHistorico` (h1 "Histórico de turnos") | `apps/web-staff/src/screens/host/ScreenHostTurnosHistorico.tsx` |
| `/host/notificacoes-prefs?tenant=...&hostId=...` | 200 | `ScreenHostNotificationPrefs` (h1 "Notificações") | `apps/web-staff/src/screens/host/ScreenHostNotificationPrefs.tsx` |
| `/host/seguranca?tenant=...&hostId=...` | 200 | `ScreenHostSecurity` (h1 "Segurança e senha") | `apps/web-staff/src/screens/host/ScreenHostSecurity.tsx` |
| `/host/aparencia?tenant=...&hostId=...` | 200 | `ScreenHostAppearance` (h1 "Aparência") | `apps/web-staff/src/screens/host/ScreenHostAppearance.tsx` |

Todos respondem 200 com server-side render correto e fazem hydrate
client-side esperado. **Nenhum 404 / nenhum redirect bloqueando carregamento
inicial.**

## Notas

- **NEXT_PUBLIC_API_URL=192.168.43.12 bug**: confirmado no console — apps
  spammam `ERR_INSUFFICIENT_RESOURCES` para
  `http://192.168.43.12:3001/api/restaurant_dev/complaints` etc. Não impacta
  as 5 rotas auditadas porque elas só usam dados mock + localStorage (não
  fazem fetch real).
- Tabs/sessões Playwright tiveram flakiness durante o run com
  resize/screenshot interferindo no estado de navegação, mas cada route foi
  validada em load isolado.
