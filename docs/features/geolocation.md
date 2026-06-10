# Geolocalização Cross-App

Esta feature protege fluxos presenciais do restaurante. A configuração inicial
de QA usa raio pequeno para forçar reprovação/aprovação determinística.

## Configuração inicial

- Raio padrão de teste: `3` metros.
- Latitude/longitude do restaurante: vem de `settings` do tenant ou env de
  desenvolvimento quando a UI de gerente ainda não estiver pronta.
- A validação deve acontecer no backend para cliente, recepcionista e API
  compartilhada. O frontend só coleta permissão, coordenadas e mostra a mensagem
  amigável.

## Comportamento esperado

- Dentro do raio: liberar fluxo presencial.
- Fora do raio: bloquear ação e explicar que ela só funciona dentro do
  restaurante.
- Sem permissão: pedir permissão de localização e oferecer nova tentativa.
- Navegador sem geolocation: mostrar alternativa operacional para staff.

## Variáveis sugeridas

```bash
GEOFENCE_RADIUS_METERS=3
GEOFENCE_RESTAURANT_LAT=-23.000000
GEOFENCE_RESTAURANT_LNG=-46.000000
```

Quando a UI de gerente for implementada, a configuração deve migrar para
`tenant settings`, com campos auditáveis:

- `geofence_enabled`
- `geofence_radius_meters`
- `restaurant_lat`
- `restaurant_lng`
- `updated_by_staff_id`
- `updated_at`

## Follow-up de produto

Criar tela em gerente para definir o ponto do restaurante no mapa e ajustar o
raio sem deploy. A primeira versão deve limitar o raio mínimo a 3 metros em QA e
um valor operacional maior em produção.
