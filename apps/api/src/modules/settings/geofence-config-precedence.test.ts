import { CustomersService } from '../customers/customers.service';
import { ScanVerificationService } from '../scan-verification/scan-verification.service';
import type { TenantConnectionProvider } from '../tenant/tenant-connection.provider';

describe('geofence owner flag precedence', () => {
  const oldLat = process.env.CUSTOMER_GEOFENCE_LATITUDE;
  const oldLon = process.env.CUSTOMER_GEOFENCE_LONGITUDE;
  const oldEnabled = process.env.CUSTOMER_GEOFENCE_ENABLED;

  beforeEach(() => {
    process.env.CUSTOMER_GEOFENCE_LATITUDE = '-23.5';
    process.env.CUSTOMER_GEOFENCE_LONGITUDE = '-46.6';
    delete process.env.CUSTOMER_GEOFENCE_ENABLED;
  });

  afterAll(() => {
    if (oldLat === undefined) delete process.env.CUSTOMER_GEOFENCE_LATITUDE;
    else process.env.CUSTOMER_GEOFENCE_LATITUDE = oldLat;
    if (oldLon === undefined) delete process.env.CUSTOMER_GEOFENCE_LONGITUDE;
    else process.env.CUSTOMER_GEOFENCE_LONGITUDE = oldLon;
    if (oldEnabled === undefined) delete process.env.CUSTOMER_GEOFENCE_ENABLED;
    else process.env.CUSTOMER_GEOFENCE_ENABLED = oldEnabled;
  });

  it('coordenadas env não religam a cerca salva como disabled', async () => {
    const tenant = {
      query: jest.fn(async () => [
        {
          geofence_enabled: false,
          geofence_latitude: -22,
          geofence_longitude: -45,
          geofence_radius_meters: 25,
        },
      ]),
    } as unknown as TenantConnectionProvider;
    const customer = new CustomersService(tenant, {} as never);
    const scan = new ScanVerificationService(tenant, {} as never);

    const customerConfig = await (
      customer as unknown as { readGeofenceConfig(): Promise<{ enabled: boolean }> }
    ).readGeofenceConfig();
    const scanConfig = await (
      scan as unknown as { readGeofenceConfig(): Promise<{ enabled: boolean }> }
    ).readGeofenceConfig();

    expect(customerConfig.enabled).toBe(false);
    expect(scanConfig.enabled).toBe(false);
  });
});
