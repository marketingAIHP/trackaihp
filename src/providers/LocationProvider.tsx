import React, { createContext, useMemo, useState, useEffect } from 'react';
import attendanceLocationManager, {
  type LocationManagerRequestOptions,
  type LocationManagerState,
} from '../services/attendanceLocationManager';
import type { Coordinates, LocationSnapshot } from '../types';

export interface LocationContextValue extends LocationManagerState {
  getCurrentLocation: (
    options?: LocationManagerRequestOptions
  ) => Promise<Coordinates | null>;
  getCurrentLocationSnapshot: (
    options?: LocationManagerRequestOptions
  ) => Promise<LocationSnapshot | null>;
  refreshLocation: (
    options?: LocationManagerRequestOptions
  ) => Promise<LocationSnapshot | null>;
  primeLocation: () => Promise<LocationSnapshot | null>;
  requestPermissions: () => Promise<boolean>;
  startTracking: () => Promise<void>;
  watchLocation: (callback: (coords: Coordinates) => void) => () => void;
}

export const LocationContext = createContext<LocationContextValue | null>(null);

interface LocationProviderProps {
  children: React.ReactNode;
  enabled?: boolean;
}

export function LocationProvider({
  children,
  enabled = true,
}: LocationProviderProps) {
  const [locationState, setLocationState] = useState<LocationManagerState>(() =>
    attendanceLocationManager.getState()
  );

  useEffect(() => attendanceLocationManager.subscribe(setLocationState), []);

  useEffect(() => {
    if (!enabled) {
      attendanceLocationManager.stop();
      return;
    }

    void attendanceLocationManager.start();

    return () => {
      attendanceLocationManager.stop();
    };
  }, [enabled]);

  const value = useMemo<LocationContextValue>(
    () => ({
      ...locationState,
      getCurrentLocation: async (options) => {
        const snapshot = await attendanceLocationManager.getCurrentLocationSnapshot(options);
        return snapshot?.coordinates ?? null;
      },
      getCurrentLocationSnapshot: attendanceLocationManager.getCurrentLocationSnapshot.bind(
        attendanceLocationManager
      ),
      refreshLocation: (options) =>
        attendanceLocationManager.refreshLocation(
          {
            ...options,
            preferCached: options?.preferCached ?? false,
          },
          false
        ),
      primeLocation: attendanceLocationManager.primeLocation.bind(attendanceLocationManager),
      requestPermissions: attendanceLocationManager.requestPermission.bind(
        attendanceLocationManager
      ),
      startTracking: attendanceLocationManager.start.bind(attendanceLocationManager),
      watchLocation: (callback) =>
        attendanceLocationManager.subscribeToLocationUpdates((snapshot) => {
          callback(snapshot.coordinates);
        }),
    }),
    [locationState]
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}
