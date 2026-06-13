import type { CustomerLocationSignal } from '@restaurant/shared-types';

export async function captureCustomerLocationSignal(options: {
  prompt: boolean;
  timeoutMs?: number;
}): Promise<CustomerLocationSignal> {
  if (shouldUseInsecureLanFallback()) {
    return {
      status: 'granted',
      latitude: finiteEnvNumber(process.env.NEXT_PUBLIC_DEV_GEOLOCATION_LATITUDE) ?? 0,
      longitude: finiteEnvNumber(process.env.NEXT_PUBLIC_DEV_GEOLOCATION_LONGITUDE) ?? 0,
      accuracyMeters:
        finiteEnvNumber(process.env.NEXT_PUBLIC_DEV_GEOLOCATION_ACCURACY_METERS) ?? 9999,
      capturedAt: new Date().toISOString(),
    };
  }

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

async function readPermissionState(): Promise<CustomerLocationSignal['status'] | null> {
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

function shouldUseInsecureLanFallback(): boolean {
  if (process.env.NEXT_PUBLIC_ALLOW_INSECURE_LAN_GEOLOCATION !== 'true') {
    return false;
  }
  if (typeof window === 'undefined') return false;
  if (window.isSecureContext) return false;
  return isPrivateLanHost(window.location.hostname);
}

function isPrivateLanHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname.endsWith('.local')) return true;
  const match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return false;
  const first = Number(match[1]);
  const second = Number(match[2]);
  if (first === 10 || first === 127) return true;
  if (first === 192 && second === 168) return true;
  return first === 172 && second >= 16 && second <= 31;
}

function finiteEnvNumber(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
