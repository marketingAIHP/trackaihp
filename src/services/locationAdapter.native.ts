import * as Location from 'expo-location';
import {
  LocationPermissionResult,
  PlatformLocationOptions,
  PlatformLocationResult,
  PlatformLocationSubscription,
  PlatformLocationWatchOptions,
} from './locationAdapter.types';

const DEFAULT_TIMEOUT_MS = 4500;
const DEFAULT_TARGET_ACCURACY = 50;
const DEFAULT_MAX_CACHED_LOCATION_AGE_MS = 20000;
const DEFAULT_RETRY_COUNT = 1;
const DEFAULT_RETRY_DELAY_MS = 700;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    }),
  ]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}

function toResult(location: Location.LocationObject): PlatformLocationResult {
  return {
    coordinates: {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    },
    accuracy: location.coords.accuracy ?? null,
    timestamp: location.timestamp,
  };
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function requestPlatformLocationPermission(): Promise<LocationPermissionResult> {
  const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
  return {
    granted: status === 'granted',
    canAskAgain,
    status,
  };
}

export async function getPlatformCurrentLocation(
  options?: PlatformLocationOptions
): Promise<PlatformLocationResult> {
  const {
    preferCached = true,
    targetAccuracy = DEFAULT_TARGET_ACCURACY,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxAgeMs = DEFAULT_MAX_CACHED_LOCATION_AGE_MS,
    retryCount = DEFAULT_RETRY_COUNT,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  } = options || {};

  const cached = await Location.getLastKnownPositionAsync({
    maxAge: maxAgeMs,
    requiredAccuracy: targetAccuracy,
  });

  const cachedAccuracy = cached?.coords.accuracy ?? Infinity;
  const cachedAgeMs =
    typeof cached?.timestamp === 'number' ? Date.now() - cached.timestamp : Infinity;
  const canUseCached =
    preferCached &&
    !!cached &&
    cachedAgeMs <= maxAgeMs &&
    cachedAccuracy <= targetAccuracy;

  if (canUseCached && cached) {
    return toResult(cached);
  }

  let bestLocation: Location.LocationObject | null = null;
  let bestAccuracy = Infinity;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    try {
      const nextLocation = await withTimeout(
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }),
        timeoutMs
      );
      const nextAccuracy = nextLocation.coords.accuracy ?? Infinity;

      if (nextAccuracy <= bestAccuracy) {
        bestLocation = nextLocation;
        bestAccuracy = nextAccuracy;
      }

      if (bestAccuracy <= targetAccuracy) {
        break;
      }
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error('Location unavailable');
    }

    if (attempt < retryCount) {
      await sleep(retryDelayMs);
    }
  }

  if (!bestLocation) {
    throw lastError || new Error('Location unavailable');
  }

  return toResult(bestLocation);
}

export async function watchPlatformLocation(
  options: PlatformLocationWatchOptions,
  callback: (result: PlatformLocationResult) => void
): Promise<PlatformLocationSubscription> {
  const subscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      distanceInterval: options.distanceInterval ?? 5,
      timeInterval: options.timeInterval ?? 5000,
    },
    (location) => {
      callback(toResult(location));
    }
  );

  return {
    remove: () => subscription.remove(),
  };
}
