import type { OwnerEstablishmentSettings } from '@restaurant/shared-types';
import {
  ownerSettingsFormToPatch,
  ownerSettingsToForm,
  validateOwnerSettingsForm,
} from './owner-settings-form';

const SETTINGS: OwnerEstablishmentSettings = {
  restaurantName: 'Casa Demo',
  timezone: 'America/Sao_Paulo',
  currency: 'BRL',
  serviceFeePercent: 10,
  geofenceEnabled: true,
  geofenceLatitude: -23.55,
  geofenceLongitude: -46.63,
  geofenceRadiusMeters: 25,
  openingHours: {
    mon: null,
    tue: [{ open: '18:00', close: '23:30' }],
    wed: [{ open: '18:00', close: '23:30' }],
    thu: [{ open: '18:00', close: '23:30' }],
    fri: [{ open: '18:00', close: '01:00' }],
    sat: [{ open: '12:00', close: '23:30' }],
    sun: [{ open: '12:00', close: '16:00' }],
  },
  updatedAt: '2026-07-11T12:00:00.000Z',
  updatedByStaffId: null,
};

describe('owner settings form', () => {
  it('preserva horários que cruzam meia-noite e gera payload BRL real', () => {
    const form = ownerSettingsToForm(SETTINGS);
    expect(validateOwnerSettingsForm(form)).toEqual([]);
    expect(ownerSettingsFormToPatch(form, SETTINGS)).toEqual({
      expectedUpdatedAt: SETTINGS.updatedAt,
    });
  });

  it('barra geofence ligado sem coordenadas e período sem duração', () => {
    const form = ownerSettingsToForm(SETTINGS);
    form.geofenceLatitude = '';
    form.openingHours.tue = [{ open: '18:00', close: '18:00' }];
    const errors = validateOwnerSettingsForm(form).join(' ');
    expect(errors).toMatch(/latitude/i);
    expect(errors).toMatch(/não podem ser iguais/i);
  });

  it('não converte horários nunca configurados em sete dias fechados ao salvar outro campo', () => {
    const form = ownerSettingsToForm({ ...SETTINGS, openingHours: null });
    form.restaurantName = 'Casa Renomeada';

    expect(ownerSettingsFormToPatch(form, { ...SETTINGS, openingHours: null })).toMatchObject({
      expectedUpdatedAt: SETTINGS.updatedAt,
      restaurantName: 'Casa Renomeada',
    });
  });

  it('envia somente campos sujos e a versão otimista', () => {
    const form = ownerSettingsToForm(SETTINGS);
    form.serviceFeePercent = '12';
    const patch = ownerSettingsFormToPatch(form, SETTINGS);
    expect(patch).toEqual({
      expectedUpdatedAt: SETTINGS.updatedAt,
      serviceFeePercent: 12,
    });
  });
});
