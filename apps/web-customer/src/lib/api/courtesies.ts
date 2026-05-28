import type {
  CourtesyStatus,
  CustomerCourtesiesResponse,
  CustomerCourtesyDto,
  CustomerCourtesyHistoryDto,
  CustomerCourtesyHistoryResponse,
} from '@restaurant/shared-types';
import { apiGet, apiPost } from '../api';

export async function listCustomerCourtesies(slug: string): Promise<CustomerCourtesyDto[]> {
  const res = await apiGet<CustomerCourtesiesResponse>(`/${slug}/customer/courtesies`);
  return res.courtesies ?? [];
}

export function respondCustomerCourtesy(
  slug: string,
  id: string,
  status: Exclude<CourtesyStatus, 'pendente'>,
): Promise<CustomerCourtesyDto> {
  return apiPost<CustomerCourtesyDto>(
    `/${slug}/customer/courtesies/${encodeURIComponent(id)}/respond`,
    { status },
  );
}

export async function listCustomerCourtesyHistory(
  slug: string,
): Promise<CustomerCourtesyHistoryDto[]> {
  const res = await apiGet<CustomerCourtesyHistoryResponse>(
    `/${slug}/customer/courtesies/history`,
  );
  return res.courtesies ?? [];
}
