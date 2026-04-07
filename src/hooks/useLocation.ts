import {useState, useEffect, useCallback, useRef} from 'react';
import {Coordinates} from '../types';
import {
  getPlatformCurrentLocation,
  requestPlatformLocationPermission,
  watchPlatformLocation,
} from '../services/locationAdapter';
import {PlatformLocationSubscription} from '../services/locationAdapter.types';

// =============================================================================
// PERFORMANCE OPTIMIZATION: Location Tracking Configuration
// =============================================================================

const LOCATION_UPDATE_DISTANCE_THRESHOLD = 15;
const LOCATION_UPDATE_TIME_INTERVAL = 30000;
const WATCH_DISTANCE_INTERVAL = 5;
const WATCH_TIME_INTERVAL = 5000;
const MIN_ACCURACY_THRESHOLD = 35;
const HIGH_ACCURACY_THRESHOLD = 20;

interface LocationState {
  coordinates: Coordinates | null;
  error: string | null;
  loading: boolean;
  accuracy: number | null;
  permissionGranted: boolean | null;
}

interface ThrottledLocationUpdate {
  coordinates: Coordinates;
  timestamp: number;
}

interface GetCurrentLocationOptions {
  preferCached?: boolean;
  targetAccuracy?: number;
  timeoutMs?: number;
}

function calculateDistance(coord1: Coordinates, coord2: Coordinates): number {
  const R = 6371e3;
  const lat1Rad = (coord1.latitude * Math.PI) / 180;
  const lat2Rad = (coord2.latitude * Math.PI) / 180;
  const deltaLat = ((coord2.latitude - coord1.latitude) * Math.PI) / 180;
  const deltaLon = ((coord2.longitude - coord1.longitude) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export function useLocation() {
  const [locationState, setLocationState] = useState<LocationState>({
    coordinates: null,
    error: null,
    loading: true,
    accuracy: null,
    permissionGranted: null,
  });

  const lastSentLocationRef = useRef<ThrottledLocationUpdate | null>(null);
  const watchSubscriptionRef = useRef<PlatformLocationSubscription | null>(null);

  const requestPermissions = useCallback(async (): Promise<boolean> => {
    try {
      const permission = await requestPlatformLocationPermission();
      setLocationState((prev) => ({
        ...prev,
        permissionGranted: permission.granted,
        error: permission.granted ? prev.error : prev.error ?? 'Location permission denied',
      }));
      return permission.granted;
    } catch (error: any) {
      setLocationState((prev) => ({
        ...prev,
        permissionGranted: false,
        error: error?.message || 'Geolocation is not supported in this browser',
      }));
      return false;
    }
  }, []);

  const getCurrentLocation = useCallback(async (
    options?: GetCurrentLocationOptions
  ): Promise<Coordinates | null> => {
    const {
      preferCached = true,
      targetAccuracy = HIGH_ACCURACY_THRESHOLD,
      timeoutMs = 12000,
    } = options || {};

    const hasPermission = await requestPermissions();
    if (!hasPermission) {
      setLocationState({
        coordinates: null,
        error: 'Location permission denied',
        loading: false,
        accuracy: null,
        permissionGranted: false,
      });
      return null;
    }

    try {
      setLocationState((prev) => ({...prev, loading: true, error: null}));

      const location = await getPlatformCurrentLocation({
        preferCached,
        targetAccuracy,
        timeoutMs,
      });

      setLocationState({
        coordinates: location.coordinates,
        error: null,
        loading: false,
        accuracy: location.accuracy,
        permissionGranted: true,
      });
      return location.coordinates;
    } catch (error: any) {
      const errorMessage =
        error.code === 'E_LOCATION_SERVICES_DISABLED'
          ? 'Location services are disabled'
          : error.code === 'E_LOCATION_UNAVAILABLE'
          ? 'Location unavailable'
          : error.message === 'timeout'
          ? 'Location request timed out'
          : error.message?.includes('not supported')
          ? 'Geolocation is not supported in this browser'
          : error.message || 'Failed to get location';

      setLocationState((prev) => ({
        coordinates: prev.coordinates,
        error: prev.coordinates ? null : errorMessage,
        loading: false,
        accuracy: prev.accuracy,
        permissionGranted: prev.permissionGranted,
      }));
      return null;
    }
  }, [requestPermissions]);

  const watchLocation = useCallback(
    (callback: (coords: Coordinates) => void) => {
      if (watchSubscriptionRef.current) {
        watchSubscriptionRef.current.remove();
        watchSubscriptionRef.current = null;
      }

      const startWatching = async () => {
        const hasPermission = await requestPermissions();
        if (!hasPermission) {
          setLocationState((prev) => ({
            ...prev,
            error: 'Location permission denied',
            loading: false,
            permissionGranted: false,
          }));
          return null;
        }

        watchSubscriptionRef.current = await watchPlatformLocation(
          {
            accuracy: MIN_ACCURACY_THRESHOLD,
            distanceInterval: WATCH_DISTANCE_INTERVAL,
            timeInterval: WATCH_TIME_INTERVAL,
          },
          (location) => {
            const accuracy = location.accuracy || Infinity;

            if (accuracy > MIN_ACCURACY_THRESHOLD) {
              return;
            }

            const coords = location.coordinates;

            setLocationState({
              coordinates: coords,
              error: null,
              loading: false,
              accuracy,
              permissionGranted: true,
            });

            const now = Date.now();
            const lastSent = lastSentLocationRef.current;

            let shouldSendUpdate = false;

            if (!lastSent) {
              shouldSendUpdate = true;
            } else {
              const timeSinceLastUpdate = now - lastSent.timestamp;
              const distanceMoved = calculateDistance(lastSent.coordinates, coords);

              shouldSendUpdate =
                distanceMoved >= LOCATION_UPDATE_DISTANCE_THRESHOLD ||
                timeSinceLastUpdate >= LOCATION_UPDATE_TIME_INTERVAL;
            }

            if (shouldSendUpdate) {
              lastSentLocationRef.current = {
                coordinates: coords,
                timestamp: now,
              };
              callback(coords);
            }
          }
        );
      };

      void startWatching();

      return () => {
        if (watchSubscriptionRef.current) {
          watchSubscriptionRef.current.remove();
          watchSubscriptionRef.current = null;
        }
      };
    },
    [requestPermissions]
  );

  const stopWatching = useCallback(() => {
    if (watchSubscriptionRef.current) {
      watchSubscriptionRef.current.remove();
      watchSubscriptionRef.current = null;
    }
  }, []);

  const shouldSendLocationUpdate = useCallback((newCoords: Coordinates): boolean => {
    const now = Date.now();
    const lastSent = lastSentLocationRef.current;

    if (!lastSent) {
      return true;
    }

    const timeSinceLastUpdate = now - lastSent.timestamp;
    const distanceMoved = calculateDistance(lastSent.coordinates, newCoords);

    return (
      distanceMoved >= LOCATION_UPDATE_DISTANCE_THRESHOLD ||
      timeSinceLastUpdate >= LOCATION_UPDATE_TIME_INTERVAL
    );
  }, []);

  const markLocationSent = useCallback((coords: Coordinates) => {
    lastSentLocationRef.current = {
      coordinates: coords,
      timestamp: Date.now(),
    };
  }, []);

  useEffect(() => {
    return () => {
      if (watchSubscriptionRef.current) {
        watchSubscriptionRef.current.remove();
        watchSubscriptionRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    void getCurrentLocation();
  }, [getCurrentLocation]);

  return {
    ...locationState,
    getCurrentLocation,
    watchLocation,
    stopWatching,
    requestPermissions,
    shouldSendLocationUpdate,
    markLocationSent,
  };
}
