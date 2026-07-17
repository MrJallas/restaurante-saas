export const OWNER_SETTINGS_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export type OwnerSettingsDay = (typeof OWNER_SETTINGS_DAYS)[number];

export interface OwnerOpeningWindow {
  /** Horário local do estabelecimento, no formato HH:MM (24 horas). */
  open: string;
  /** Horário local do estabelecimento, no formato HH:MM (24 horas). */
  close: string;
}

/** `null` significa que o estabelecimento não abre naquele dia. */
export type OwnerOpeningHours = Record<OwnerSettingsDay, OwnerOpeningWindow[] | null>;

export interface OwnerEstablishmentSettings {
  restaurantName: string;
  timezone: string;
  currency: 'BRL';
  serviceFeePercent: number;
  geofenceEnabled: boolean;
  geofenceLatitude: number | null;
  geofenceLongitude: number | null;
  geofenceRadiusMeters: number;
  /** `null` enquanto o dono ainda não cadastrou os horários. */
  openingHours: OwnerOpeningHours | null;
  updatedAt: string;
  updatedByStaffId: string | null;
}

export type UpdateOwnerEstablishmentSettings = Partial<
  Pick<
    OwnerEstablishmentSettings,
    | 'restaurantName'
    | 'timezone'
    | 'currency'
    | 'serviceFeePercent'
    | 'geofenceEnabled'
    | 'geofenceLatitude'
    | 'geofenceLongitude'
    | 'geofenceRadiusMeters'
    | 'openingHours'
  >
> & {
  /** Versão lida pelo formulário; impede uma aba stale de sobrescrever outra. */
  expectedUpdatedAt: string;
};
