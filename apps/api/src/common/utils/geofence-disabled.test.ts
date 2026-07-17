import { evaluateCustomerGeofence } from './geofence';

describe('geofence enabled setting', () => {
  it('não exige permissão nem fabrica aprovação quando o dono desligou a cerca', () => {
    expect(
      evaluateCustomerGeofence(
        { status: 'denied' },
        { enabled: false, latitude: -23, longitude: -46, radiusMeters: 3 },
      ),
    ).toEqual({
      status: 'denied',
      distanceMeters: null,
      insideRadius: null,
      radiusMeters: null,
    });
  });
});
