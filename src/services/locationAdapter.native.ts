import * as Location from 'expo-location';
import {
  LocationPermissionResult,
  PlatformLocationOptions,
  PlatformLocationResult,
  PlatformLocationSubscription,
  PlatformLocationWatchOptions,
} from './locationAdapter.types';

const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_TARGET_ACCURACY = 20;
const MAX_CACHED_LOCATION_AGE_MS = 10000;
const MAX_CACHED_LOCATION_ACCURACY = 35;

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
  } = options || {};

  const cached = await Location.getLastKnownPositionAsync({
    maxAge: MAX_CACHED_LOCATION_AGE_MS,
    requiredAccuracy: MAX_CACHED_LOCATION_ACCURACY,
  });

  const cachedAccuracy = cached?.coords.accuracy ?? Infinity;
  const cachedAgeMs =
    typeof cached?.timestamp === 'number' ? Date.now() - cached.timestamp : Infinity;
  const canUseCached =
    preferCached &&
    !!cached &&
    cachedAgeMs <= MAX_CACHED_LOCATION_AGE_MS &&
    cachedAccuracy <= Math.min(MAX_CACHED_LOCATION_ACCURACY, targetAccuracy + 10);

  if (canUseCached && cached) {
    return toResult(cached);
  }

  const attemptOrder = [
    Location.Accuracy.Balanced,
    Location.Accuracy.High,
    Location.Accuracy.Highest,
  ];

  let bestLocation: Location.LocationObject | null = null;
  let bestAccuracy = Infinity;

  for (const accuracyLevel of attemptOrder) {
    try {
      const nextLocation = await withTimeout(
        Location.getCurrentPositionAsync({
          accuracy: accuracyLevel,
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
    } catch {
      // Keep the best successful fix gathered so far.
    }
  }

  if (!bestLocation) {
    throw new Error('Location unavailable');
  }

  return toResult(bestLocation);
}

export async function watchPlatformLocation(
  options: PlatformLocationWatchOptions,
  callback: (result: PlatformLocationResult) => void
): Promise<PlatformLocationSubscription> {
  const subscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.High,
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
