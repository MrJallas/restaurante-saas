import { haversineDistanceMeters } from './geofence';

/* eslint-disable no-console */
export function runGeofenceAssertions(): void {
  const origin = { latitude: -23.561684, longitude: -46.655981 };
  const same = haversineDistanceMeters(origin, origin);
  if (Math.abs(same) > 0.001) {
    throw new Error('same-point distance should be zero');
  }

  const near = haversineDistanceMeters(origin, {
    latitude: -23.561684,
    longitude: -46.655952,
  });
  if (near < 2.5 || near > 3.5) {
    throw new Error(`expected ~3m east/west distance, got ${near}`);
  }

  const far = haversineDistanceMeters(origin, {
    latitude: -23.561684,
    longitude: -46.656961,
  });
  if (far < 95 || far > 105) {
    throw new Error(`expected ~100m east/west distance, got ${far}`);
  }

  console.log('geofence assertions OK');
}

if (require.main === module) {
  runGeofenceAssertions();
}
