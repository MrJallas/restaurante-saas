import type {
  OwnerEstablishmentSettings,
  OwnerOpeningHours,
  OwnerSettingsDay,
  UpdateOwnerEstablishmentSettings,
} from '@restaurant/shared-types';
import { OWNER_SETTINGS_DAYS } from '@restaurant/shared-types';

export const OWNER_DAY_LABELS: Record<OwnerSettingsDay, string> = {
  mon: 'Segunda',
  tue: 'Terça',
  wed: 'Quarta',
  thu: 'Quinta',
  fri: 'Sexta',
  sat: 'Sábado',
  sun: 'Domingo',
};

export interface OwnerSettingsFormState {
  restaurantName: string;
  timezone: string;
  serviceFeePercent: string;
  geofenceEnabled: boolean;
  geofenceLatitude: string;
  geofenceLongitude: string;
  geofenceRadiusMeters: string;
  openingHours: OwnerOpeningHours;
  openingHoursConfigured: boolean;
}

export function emptyOwnerOpeningHours(): OwnerOpeningHours {
  return {
    mon: null,
    tue: null,
    wed: null,
    thu: null,
    fri: null,
    sat: null,
    sun: null,
  };
}

export function ownerSettingsToForm(settings: OwnerEstablishmentSettings): OwnerSettingsFormState {
  return {
    restaurantName: settings.restaurantName,
    timezone: settings.timezone,
    serviceFeePercent: String(settings.serviceFeePercent),
    geofenceEnabled: settings.geofenceEnabled,
    geofenceLatitude: settings.geofenceLatitude == null ? '' : String(settings.geofenceLatitude),
    geofenceLongitude: settings.geofenceLongitude == null ? '' : String(settings.geofenceLongitude),
    geofenceRadiusMeters: String(settings.geofenceRadiusMeters),
    openingHours: settings.openingHours ?? emptyOwnerOpeningHours(),
    openingHoursConfigured: settings.openingHours !== null,
  };
}

export function validateOwnerSettingsForm(form: OwnerSettingsFormState): string[] {
  const errors: string[] = [];
  const name = form.restaurantName.trim();
  if (name.length < 2 || name.length > 200) {
    errors.push('Informe um nome entre 2 e 200 caracteres.');
  }
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: form.timezone }).format(new Date());
  } catch {
    errors.push('Informe um fuso horário IANA válido.');
  }
  const fee = Number(form.serviceFeePercent);
  if (!Number.isFinite(fee) || fee < 0 || fee > 30) {
    errors.push('A taxa de serviço deve ficar entre 0% e 30%.');
  }
  const radius = Number(form.geofenceRadiusMeters);
  if (!Number.isFinite(radius) || radius < 3 || radius > 1000) {
    errors.push('O raio deve ficar entre 3 e 1000 metros.');
  }
  if (form.geofenceEnabled) {
    const lat = Number(form.geofenceLatitude);
    const lng = Number(form.geofenceLongitude);
    if (form.geofenceLatitude.trim() === '' || !Number.isFinite(lat) || lat < -90 || lat > 90) {
      errors.push('Informe uma latitude válida antes de ativar a presença.');
    }
    if (form.geofenceLongitude.trim() === '' || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      errors.push('Informe uma longitude válida antes de ativar a presença.');
    }
  }
  for (const day of OWNER_SETTINGS_DAYS) {
    const windows = form.openingHours[day];
    if (!windows) continue;
    if (windows.length < 1 || windows.length > 3) {
      errors.push(`${OWNER_DAY_LABELS[day]} deve ter de um a três períodos.`);
      continue;
    }
    for (const window of windows) {
      if (!/^\d{2}:\d{2}$/.test(window.open) || !/^\d{2}:\d{2}$/.test(window.close)) {
        errors.push(`Revise o horário de ${OWNER_DAY_LABELS[day]}.`);
      } else if (window.open === window.close) {
        errors.push(`Abertura e fechamento não podem ser iguais em ${OWNER_DAY_LABELS[day]}.`);
      }
    }
  }
  return errors;
}

export function ownerSettingsFormToPatch(
  form: OwnerSettingsFormState,
  baseline: OwnerEstablishmentSettings,
): UpdateOwnerEstablishmentSettings {
  const next = {
    restaurantName: form.restaurantName.trim(),
    timezone: form.timezone.trim(),
    serviceFeePercent: Number(form.serviceFeePercent),
    geofenceEnabled: form.geofenceEnabled,
    geofenceLatitude: form.geofenceLatitude.trim() === '' ? null : Number(form.geofenceLatitude),
    geofenceLongitude: form.geofenceLongitude.trim() === '' ? null : Number(form.geofenceLongitude),
    geofenceRadiusMeters: Number(form.geofenceRadiusMeters),
    openingHours: form.openingHoursConfigured ? form.openingHours : null,
  };
  const patch: UpdateOwnerEstablishmentSettings = {
    expectedUpdatedAt: baseline.updatedAt,
  };
  for (const key of Object.keys(next) as Array<keyof typeof next>) {
    if (JSON.stringify(next[key]) !== JSON.stringify(baseline[key])) {
      // A união é correlacionada por `key`; Object.assign preserva o tipo
      // público sem abrir index signature mutável no DTO.
      Object.assign(patch, { [key]: next[key] });
    }
  }
  return patch;
}
