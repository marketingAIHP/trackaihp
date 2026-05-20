import { useContext, useMemo, useSyncExternalStore } from 'react';
import { LocationContext } from '../providers/LocationProvider';
import attendanceLocationManager from '../services/attendanceLocationManager';

function useLocationContext() {
  const context = useContext(LocationContext);

  if (!context) {
    throw new Error('useLocation must be used inside LocationProvider');
  }

  return context;
}

export function useLocationState() {
  useLocationContext();

  return useSyncExternalStore(
    attendanceLocationManager.subscribe,
    attendanceLocationManager.getState,
    attendanceLocationManager.getState
  );
}

export function useCachedLocation() {
  return useLocationState();
}

export function useLocationActions() {
  return useLocationContext();
}

export function useLocation() {
  const state = useLocationState();
  const actions = useLocationActions();

  return useMemo(
    () => ({
      ...state,
      ...actions,
    }),
    [actions, state]
  );
}
