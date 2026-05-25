import type { CustomerLocationSignal } from '@restaurant/shared-types';

export async function captureCustomerLocationSignal(options: {
  prompt: boolean;
  timeoutMs?: number;
}): Promise<CustomerLocationSignal> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return { status: 'unsupported', capturedAt: new Date().toISOString() };
  }

  const permissionState = await readPermissionState();
  if (!options.prompt && permissionState !== 'granted') {
    return {
      status: permissionState ?? 'prompt',
      capturedAt: new Date().toISOString(),
    };
  }

  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      resolve({ status: 'unavailable', capturedAt: new Date().toISOString() });
    }, options.timeoutMs ?? 4000);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        window.clearTimeout(timeout);
        resolve({
          status: 'granted',
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
          capturedAt: new Date().toISOString(),
        });
      },
      (error) => {
        window.clearTimeout(timeout);
        resolve({
          status: error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable',
          capturedAt: new Date().toISOString(),
        });
      },
      {
        enableHighAccuracy: false,
        maximumAge: 60_000,
        timeout: options.timeoutMs ?? 4000,
      },
    );
  });
}

async function readPermissionState(): Promise<
  CustomerLocationSignal['status'] | null
> {
  if (!('permissions' in navigator)) return null;
  try {
    const status = await navigator.permissions.query({
      name: 'geolocation' as PermissionName,
    });
    if (status.state === 'granted') return 'granted';
    if (status.state === 'denied') return 'denied';
    return 'prompt';
  } catch {
    return null;
  }
}
