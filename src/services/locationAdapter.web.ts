import {
  LocationPermissionResult,
  PlatformLocationOptions,
  PlatformLocationResult,
  PlatformLocationSubscription,
  PlatformLocationWatchOptions,
} from './locationAdapter.types';

const DEFAULT_TIMEOUT_MS = 12000;

function assertGeolocationSupport() {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new Error('Geolocation is not supported in this browser');
  }
}

function toResult(position: GeolocationPosition): PlatformLocationResult {
  return {
    coordinates: {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    },
    accuracy: position.coords.accuracy ?? null,
    timestamp: position.timestamp,
  };
}

async function getPermissionStatus(): Promise<LocationPermissionResult> {
  if (typeof navigator === 'undefined' || !('permissions' in navigator)) {
    return { granted: false, status: 'prompt', canAskAgain: true };
  }

  try {
    const status = await navigator.permissions.query({
      name: 'geolocation' as PermissionName,
    });

    return {
      granted: status.state === 'granted',
      canAskAgain: status.state !== 'denied',
      status: status.state as LocationPermissionResult['status'],
    };
  } catch {
    return { granted: false, status: 'prompt', canAskAgain: true };
  }
}

export async function requestPlatformLocationPermission(): Promise<LocationPermissionResult> {
  assertGeolocationSupport();

  const permission = await getPermissionStatus();
  if (permission.granted || permission.status === 'denied') {
    return permission;
  }

  return new Promise<LocationPermissionResult>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => resolve({ granted: true, canAskAgain: true, status: 'granted' }),
      (error) =>
        resolve({
          granted: false,
          canAskAgain: error.code !== error.PERMISSION_DENIED,
          status: error.code === error.PERMISSION_DENIED ? 'denied' : 'prompt',
        }),
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 5000,
      }
    );
  });
}

export async function getPlatformCurrentLocation(
  options?: PlatformLocationOptions
): Promise<PlatformLocationResult> {
  assertGeolocationSupport();

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const preferCached = options?.preferCached ?? true;

  return new Promise<PlatformLocationResult>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(toResult(position)),
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(new Error('Location permission denied'));
          return;
        }
        if (error.code === error.TIMEOUT) {
          reject(new Error('timeout'));
          return;
        }
        if (error.code === error.POSITION_UNAVAILABLE) {
          reject(new Error('Location unavailable'));
          return;
        }
        reject(new Error(error.message || 'Failed to get location'));
      },
      {
        enableHighAccuracy: true,
        maximumAge: preferCached ? 10000 : 0,
        timeout: timeoutMs,
      }
    );
  });
}

export async function watchPlatformLocation(
  options: PlatformLocationWatchOptions,
  callback: (result: PlatformLocationResult) => void
): Promise<PlatformLocationSubscription> {
  assertGeolocationSupport();

  const watchId = navigator.geolocation.watchPosition(
    (position) => callback(toResult(position)),
    () => {
      // Hook state handles stale/error messaging from explicit reads.
    },
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: options.timeInterval ?? 5000,
    }
  );

  return {
    remove: () => navigator.geolocation.clearWatch(watchId),
  };
}
