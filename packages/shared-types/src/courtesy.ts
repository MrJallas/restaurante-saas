export type CourtesyStatus = 'pendente' | 'aceita' | 'recusada';

export interface CustomerCourtesyDto {
  id: string;
  tableSessionId: string;
  tableNumber: number | null;
  type: string;
  item: string;
  status: CourtesyStatus;
  managerName: string | null;
  notes: string | null;
  createdAt: string;
  respondedAt: string | null;
}

export interface CustomerCourtesiesResponse {
  courtesies: CustomerCourtesyDto[];
}
