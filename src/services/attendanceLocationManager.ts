import { AppState } from 'react-native';
import { ATTENDANCE_GPS_ACCURACY_THRESHOLD } from '../constants/config';
import type { Coordinates, LocationSnapshot } from '../types';
import { calculateDistance } from '../utils/geofence';
import {
  getPlatformCurrentLocation,
  requestPlatformLocationPermission,
  watchPlatformLocation,
} from './locationAdapter';
import type {
  PlatformLocationOptions,
  PlatformLocationResult,
  PlatformLocationSubscription,
} from './locationAdapter.types';

const WATCH_TIME_INTERVAL_MS = 5000;
const WATCH_DISTANCE_INTERVAL_METERS = 0;
const DEFAULT_CACHE_MAX_AGE_MS = 20000;
const STALE_CACHE_FALLBACK_AGE_MS = 60000;
const DEFAULT_TIMEOUT_MS = 4500;
const DEFAULT_RETRY_COUNT = 1;
const DEFAULT_RETRY_DELAY_MS = 700;
const MAX_WATCH_ACCURACY_METERS = 100;
const MIN_DISTANCE_FOR_UI_UPDATE_METERS = 3;
const MIN_ACCURACY_DELTA_METERS = 5;

export interface LocationManagerState {
  coordinates: Coordinates | null;
  accuracy: number | null;
  error: string | null;
  loading: boolean;
  permissionGranted: boolean | null;
  isWatching: boolean;
  isStarted: boolean;
  lastUpdatedAt: number | null;
}

export interface LocationManagerRequestOptions extends PlatformLocationOptions {
  allowStaleFallback?: boolean;
}

type StateListener = (state: LocationManagerState) => void;
type SnapshotListener = (snapshot: LocationSnapshot) => void;

const initialState: LocationManagerState = {
  coordinates: null,
  accuracy: null,
  error: null,
  loading: false,
  permissionGranted: null,
  isWatching: false,
  isStarted: false,
  lastUpdatedAt: null,
};

let state: LocationManagerState = initialState;
let latestSnapshot: LocationSnapshot | null = null;
let watchSubscription: PlatformLocationSubscription | null = null;
let appStateSubscription: { remove: () => void } | null = null;
let permissionPromise: Promise<boolean> | null = null;
let locationRequestPromise: Promise<LocationSnapshot | null> | null = null;
let watchStartPromise: Promise<void> | null = null;
let isStarted = false;

const stateListeners = new Set<StateListener>();
const snapshotListeners = new Set<SnapshotListener>();

function toSnapshot(location: PlatformLocationResult): LocationSnapshot {
  return {
    coordinates: location.coordinates,
    accuracy: location.accuracy,
    timestamp: location.timestamp,
  };
}

function isFiniteAccuracy(accuracy: number | null | undefined): accuracy is number {
  return typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy > 0;
}

function isSnapshotFresh(snapshot: LocationSnapshot, maxAgeMs: number): boolean {
  return Date.now() - snapshot.timestamp <= maxAgeMs;
}

function isSnapshotAccurateEnough(
  snapshot: LocationSnapshot,
  targetAccuracy: number
): boolean {
  return isFiniteAccuracy(snapshot.accuracy) && snapshot.accuracy <= targetAccuracy;
}

function isSnapshotUsable(
  snapshot: LocationSnapshot,
  targetAccuracy: number,
  maxAgeMs: number
): boolean {
  return isSnapshotFresh(snapshot, maxAgeMs) && isSnapshotAccurateEnough(snapshot, targetAccuracy);
}

function normalizeLocationError(error: any): string {
  if (error?.code === 'E_LOCATION_SERVICES_DISABLED') {
    return 'Location services are disabled';
  }
  if (error?.code === 'E_LOCATION_UNAVAILABLE') {
    return 'Location unavailable';
  }
  if (error?.message === 'timeout') {
    return 'Location request timed out';
  }
  if (error?.message?.includes?.('not supported')) {
    return 'Geolocation is not supported on this device';
  }
  return error?.message || 'Failed to get location';
}

function hasMeaningfulSnapshotChange(nextSnapshot: LocationSnapshot): boolean {
  if (!state.coordinates || !latestSnapshot) {
    return true;
  }

  const distanceMoved = calculateDistance(state.coordinates, nextSnapshot.coordinates);
  const accuracyChanged =
    state.accuracy === null ||
    nextSnapshot.accuracy === null ||
    Math.abs(state.accuracy - nextSnapshot.accuracy) >= MIN_ACCURACY_DELTA_METERS;

  return distanceMoved >= MIN_DISTANCE_FOR_UI_UPDATE_METERS || accuracyChanged;
}

function isSameCoordinates(
  previous: Coordinates | null,
  next: Coordinates | null
): boolean {
  if (previous === next) return true;
  if (!previous || !next) return false;
  return previous.latitude === next.latitude && previous.longitude === next.longitude;
}

function setState(nextState: LocationManagerState | ((prev: LocationManagerState) => LocationManagerState)) {
  const resolvedState = typeof nextState === 'function' ? nextState(state) : nextState;

  const hasChanged =
    !isSameCoordinates(state.coordinates, resolvedState.coordinates) ||
    state.accuracy !== resolvedState.accuracy ||
    state.error !== resolvedState.error ||
    state.loading !== resolvedState.loading ||
    state.permissionGranted !== resolvedState.permissionGranted ||
    state.isWatching !== resolvedState.isWatching ||
    state.isStarted !== resolvedState.isStarted ||
    state.lastUpdatedAt !== resolvedState.lastUpdatedAt;

  if (!hasChanged) {
    return;
  }

  state = resolvedState;
  stateListeners.forEach((listener) => listener(state));
}

function publishSnapshot(snapshot: LocationSnapshot): LocationSnapshot {
  if (latestSnapshot && snapshot.timestamp <= latestSnapshot.timestamp) {
    return latestSnapshot;
  }

  latestSnapshot = snapshot;
  snapshotListeners.forEach((listener) => listener(snapshot));

  const shouldUpdateUi = hasMeaningfulSnapshotChange(snapshot) || !state.coordinates;

  setState((prev) => ({
    ...prev,
    coordinates: shouldUpdateUi ? snapshot.coordinates : prev.coordinates,
    accuracy: shouldUpdateUi ? snapshot.accuracy : prev.accuracy,
    error: null,
    loading: false,
    permissionGranted: true,
    lastUpdatedAt: shouldUpdateUi ? snapshot.timestamp : prev.lastUpdatedAt,
  }));

  return snapshot;
}

async function requestPermission(): Promise<boolean> {
  if (permissionPromise) {
    return permissionPromise;
  }

  permissionPromise = (async () => {
    try {
      const permission = await requestPlatformLocationPermission();

      setState((prev) => ({
        ...prev,
        permissionGranted: permission.granted,
        error: permission.granted ? null : prev.coordinates ? null : 'Location permission denied',
      }));

      return permission.granted;
    } catch (error: any) {
      setState((prev) => ({
        ...prev,
        loading: false,
        permissionGranted: false,
        error: prev.coordinates ? null : normalizeLocationError(error),
      }));
      return false;
    } finally {
      permissionPromise = null;
    }
  })();

  return permissionPromise;
}

function stopWatch() {
  if (watchSubscription) {
    watchSubscription.remove();
    watchSubscription = null;
  }

  setState((prev) => ({
    ...prev,
    isWatching: false,
  }));
}

async function ensureWatchStarted(): Promise<void> {
  if (watchSubscription || AppState.currentState !== 'active') {
    return;
  }

  if (watchStartPromise) {
    return watchStartPromise;
  }

  watchStartPromise = (async () => {
    const hasPermission = await requestPermission();
    if (!hasPermission || AppState.currentState !== 'active' || watchSubscription) {
      return;
    }

    try {
      watchSubscription = await watchPlatformLocation(
        {
          distanceInterval: WATCH_DISTANCE_INTERVAL_METERS,
          timeInterval: WATCH_TIME_INTERVAL_MS,
          accuracy: ATTENDANCE_GPS_ACCURACY_THRESHOLD,
        },
        (location) => {
          if ((location.accuracy ?? Infinity) > MAX_WATCH_ACCURACY_METERS) {
            return;
          }

          publishSnapshot(toSnapshot(location));
        }
      );

      setState((prev) => ({
        ...prev,
        isWatching: true,
      }));
    } catch (error: any) {
      setState((prev) => ({
        ...prev,
        isWatching: false,
        error: prev.coordinates ? null : normalizeLocationError(error),
      }));
    }
  })().finally(() => {
    watchStartPromise = null;
  });

  return watchStartPromise;
}

function ensureAppStateSubscription() {
  if (appStateSubscription) {
    return;
  }

  appStateSubscription = AppState.addEventListener('change', (nextState) => {
    if (!isStarted) {
      return;
    }

    if (nextState === 'active') {
      void ensureWatchStarted();
      void attendanceLocationManager.primeLocation();
      return;
    }

    stopWatch();
  });
}

const attendanceLocationManager = {
  getState(): LocationManagerState {
    return state;
  },

  getLatestSnapshot(): LocationSnapshot | null {
    return latestSnapshot;
  },

  subscribe(listener: StateListener): () => void {
    stateListeners.add(listener);
    listener(state);

    return () => {
      stateListeners.delete(listener);
    };
  },

  subscribeToLocationUpdates(listener: SnapshotListener): () => void {
    snapshotListeners.add(listener);

    if (latestSnapshot) {
      listener(latestSnapshot);
    }

    return () => {
      snapshotListeners.delete(listener);
    };
  },

  async start(): Promise<void> {
    if (isStarted) {
      await ensureWatchStarted();
      return;
    }

    isStarted = true;
    setState((prev) => ({
      ...prev,
      isStarted: true,
    }));

    ensureAppStateSubscription();
    await ensureWatchStarted();
    void this.primeLocation();
  },

  stop(): void {
    isStarted = false;
    stopWatch();

    if (appStateSubscription) {
      appStateSubscription.remove();
      appStateSubscription = null;
    }

    latestSnapshot = null;
    locationRequestPromise = null;
    permissionPromise = null;
    setState(initialState);
  },

  async requestPermission(): Promise<boolean> {
    return requestPermission();
  },

  async primeLocation(): Promise<LocationSnapshot | null> {
    if (
      latestSnapshot &&
      isSnapshotUsable(
        latestSnapshot,
        ATTENDANCE_GPS_ACCURACY_THRESHOLD,
        DEFAULT_CACHE_MAX_AGE_MS
      )
    ) {
      return latestSnapshot;
    }

    return this.refreshLocation(
      {
        preferCached: true,
        targetAccuracy: ATTENDANCE_GPS_ACCURACY_THRESHOLD,
        maxAgeMs: DEFAULT_CACHE_MAX_AGE_MS,
        timeoutMs: DEFAULT_TIMEOUT_MS,
        retryCount: DEFAULT_RETRY_COUNT,
        retryDelayMs: DEFAULT_RETRY_DELAY_MS,
        allowStaleFallback: true,
      },
      true
    );
  },

  async refreshLocation(
    options?: LocationManagerRequestOptions,
    silent = false
  ): Promise<LocationSnapshot | null> {
    if (locationRequestPromise) {
      return locationRequestPromise;
    }

    const requestOptions: LocationManagerRequestOptions = {
      preferCached: options?.preferCached ?? true,
      targetAccuracy: options?.targetAccuracy ?? ATTENDANCE_GPS_ACCURACY_THRESHOLD,
      maxAgeMs: options?.maxAgeMs ?? DEFAULT_CACHE_MAX_AGE_MS,
      timeoutMs: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      retryCount: options?.retryCount ?? DEFAULT_RETRY_COUNT,
      retryDelayMs: options?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
      allowStaleFallback: options?.allowStaleFallback ?? true,
    };

    locationRequestPromise = (async () => {
      const hasPermission = await requestPermission();
      if (!hasPermission) {
        setState((prev) => ({
          ...prev,
          loading: false,
          permissionGranted: false,
        }));
        return null;
      }

      if (!silent || !latestSnapshot) {
        setState((prev) => ({
          ...prev,
          loading: true,
          error: null,
        }));
      }

      try {
        const location = await getPlatformCurrentLocation(requestOptions);
        return publishSnapshot(toSnapshot(location));
      } catch (error: any) {
        const errorMessage = normalizeLocationError(error);

        if (
          latestSnapshot &&
          requestOptions.allowStaleFallback &&
          isSnapshotUsable(
            latestSnapshot,
            requestOptions.targetAccuracy ?? ATTENDANCE_GPS_ACCURACY_THRESHOLD,
            STALE_CACHE_FALLBACK_AGE_MS
          )
        ) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: null,
          }));
          return latestSnapshot;
        }

        setState((prev) => ({
          ...prev,
          loading: false,
          error: prev.coordinates ? null : errorMessage,
        }));
        return null;
      } finally {
        locationRequestPromise = null;
      }
    })();

    return locationRequestPromise;
  },

  async getCurrentLocationSnapshot(
    options?: LocationManagerRequestOptions
  ): Promise<LocationSnapshot | null> {
    const targetAccuracy = options?.targetAccuracy ?? ATTENDANCE_GPS_ACCURACY_THRESHOLD;
    const maxAgeMs = options?.maxAgeMs ?? DEFAULT_CACHE_MAX_AGE_MS;

    if (latestSnapshot && isSnapshotUsable(latestSnapshot, targetAccuracy, maxAgeMs)) {
      return latestSnapshot;
    }

    const refreshedSnapshot = await this.refreshLocation(options, !!latestSnapshot);
    if (refreshedSnapshot) {
      return refreshedSnapshot;
    }

    if (
      latestSnapshot &&
      (options?.allowStaleFallback ?? true) &&
      isSnapshotUsable(latestSnapshot, targetAccuracy, STALE_CACHE_FALLBACK_AGE_MS)
    ) {
      return latestSnapshot;
    }

    return null;
  },
};

export default attendanceLocationManager;
