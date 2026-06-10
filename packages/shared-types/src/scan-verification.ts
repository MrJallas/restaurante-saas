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

export interface CustomerLocationCheck {
  status: CustomerLocationStatus;
  distanceMeters: number | null;
  insideRadius: boolean | null;
  radiusMeters: number | null;
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
  distanceMeters: number | null;
  insideRadius: boolean | null;
  radiusMeters: number | null;
  escalationLevel: number;
  escalationChainId?: string | null;
  expiresAt: string;
  ttlExpiresAt: string;
  decidedAt: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  /** Distância do cliente até o centro configurado do salão, em metros. */
  locationDistanceMeters: number | null;
  /** Raio operacional aceito para entrada via QR físico, em metros. */
  locationRadiusMeters: number;
  /** `true` quando a distância calculada fica dentro do raio configurado. */
  locationWithinRestaurant: boolean | null;
}
