import { HttpException, HttpStatus } from '@nestjs/common';
import type { CustomerLocationCheck, CustomerLocationSignal } from '@restaurant/shared-types';

export interface GeofenceConfig {
  enabled: boolean;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
}

export function haversineDistanceMeters(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMeters * c;
}

export function assertUsableCustomerLocation(location?: CustomerLocationSignal | null): {
  latitude: number;
  longitude: number;
} {
  if (!location || location.status !== 'granted') {
    throw new HttpException(
      'Permita o acesso à localização para entrar no app do restaurante.',
      HttpStatus.FORBIDDEN,
    );
  }
  const latitude = location.latitude;
  const longitude = location.longitude;
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    throw new HttpException(
      'Não consegui ler sua localização. Tente novamente perto da mesa.',
      HttpStatus.BAD_REQUEST,
    );
  }
  return { latitude, longitude };
}

export function evaluateCustomerGeofence(
  location: CustomerLocationSignal | null | undefined,
  config: GeofenceConfig,
): CustomerLocationCheck {
  // O dono pode desligar a exigência presencial. Nesse estado não pedimos
  // permissão de localização nem fabricamos uma aprovação geográfica.
  if (!config.enabled) {
    return {
      status: location?.status ?? 'unknown',
      distanceMeters: null,
      insideRadius: null,
      radiusMeters: null,
    };
  }
  const coords = assertUsableCustomerLocation(location);
  if (config.latitude == null || config.longitude == null) {
    return {
      status: 'granted',
      distanceMeters: null,
      insideRadius: null,
      radiusMeters: config.radiusMeters,
    };
  }

  const distanceMeters = haversineDistanceMeters(coords, {
    latitude: config.latitude,
    longitude: config.longitude,
  });
  const roundedDistance = Math.round(distanceMeters * 10) / 10;
  const insideRadius = roundedDistance <= config.radiusMeters;
  return {
    status: 'granted',
    distanceMeters: roundedDistance,
    insideRadius,
    radiusMeters: config.radiusMeters,
  };
}

export function assertInsideCustomerGeofence(check: CustomerLocationCheck): void {
  if (check.insideRadius === false) {
    throw new HttpException(
      `Você está fora da área do restaurante (${Math.round(
        check.distanceMeters ?? 0,
      )}m de distância). Aproxime-se da mesa para entrar.`,
      HttpStatus.FORBIDDEN,
    );
  }
}
