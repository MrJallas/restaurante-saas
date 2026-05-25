export type ScanVerificationStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired';

export type CustomerLocationStatus =
  | 'unknown'
  | 'prompt'
  | 'granted'
  | 'denied'
  | 'unavailable'
  | 'unsupported';

export interface CustomerLocationSignal {
  status: CustomerLocationStatus;
  latitude?: number | null;
  longitude?: number | null;
  accuracyMeters?: number | null;
  capturedAt?: string | null;
}

export interface ScanVerificationRequestDto {
  id: string;
  tableSessionId: string;
  tableId: string;
  tableCode: string;
  tableNumber: number;
  customerId: string;
  requesterName: string;
  cpfMasked: string | null;
  status: ScanVerificationStatus;
  locationStatus: CustomerLocationStatus;
  location: CustomerLocationSignal;
  escalationLevel: number;
  escalationChainId?: string | null;
  expiresAt: string;
  ttlExpiresAt: string;
  decidedAt: string | null;
  rejectionReason?: string | null;
  createdAt: string;
}
