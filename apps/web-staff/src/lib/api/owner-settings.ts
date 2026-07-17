import type {
  OwnerEstablishmentSettings,
  UpdateOwnerEstablishmentSettings,
} from '@restaurant/shared-types';
import { staffGet, staffPatch } from '../api';

export const ownerEstablishmentApi = (slug: string) => ({
  get: () => staffGet<OwnerEstablishmentSettings>(`/${slug}/settings/establishment`),
  update: (body: UpdateOwnerEstablishmentSettings) =>
    staffPatch<OwnerEstablishmentSettings>(`/${slug}/settings/establishment`, body),
});
