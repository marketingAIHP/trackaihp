/**
 * Live Location Tracking Service
 *
 * This service manages continuous location updates for employees while checked in.
 * Works in both Expo Go (foreground only) and development builds (background).
 *
 * REFACTOR NOTE: This service now relies 100% on the native background service (startLocationUpdatesAsync)
 * to deliver updates. Foreground polling (setInterval) has been removed to prevent duplicate data
 * and race conditions.
 */

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { Coordinates } from '../types';
import { employeeApi } from './api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BACKGROUND_LOCATION_TASK } from './backgroundLocationTask';
import { initializeLocationState, clearLocationState } from './locationState';
import { startForegroundSender, stopForegroundSender } from './foregroundSender';
import LocationTrackingService from './LocationTrackingService';

// =============================================================================
// CONFIGURATION
// =============================================================================

const STORAGE_KEYS = {
  IS_TRACKING: '@liveLocation:isTracking',
  EMPLOYEE_ID: '@liveLocation:employeeId',
  SITE_ID: '@liveLocation:siteId',
};

// TUNED: 15 meters allows "stationary" logic to still work loosely while saving battery
const BACKGROUND_DISTANCE_INTERVAL = 15;
const BACKGROUND_TIME_INTERVAL = 15000; // 15 seconds

// =============================================================================
// STATE
// =============================================================================

let isTrackingActive = false;
let appStateSubscription: any = null;

// DEV SAFETY: Prevent Fast Refresh from triggering duplicate startup logic
// In production, this file loads once. In dev, it might reload.
// We use a module-level guard that persists slightly better in some dev environments,
// but mainly `startLiveTracking` idempotency handles the logic.
// This flag is just for extra logging context.
let isDevReload = false;
if (__DEV__) {
  isDevReload = true;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Send a single location update to the server.
 * Used primarily for the initial location on check-in.
 */
async function sendLocationToServer(coords: { latitude: number; longitude: number }, timestamp?: number): Promise<boolean> {
  try {
    const employeeIdStr = await AsyncStorage.getItem(STORAGE_KEYS.EMPLOYEE_ID);
    const siteIdStr = await AsyncStorage.getItem(STORAGE_KEYS.SITE_ID);

    if (!employeeIdStr) {
      console.log('[LiveLocation] No employee ID found, cannot send location');
      return false;
    }

    const employeeId = parseInt(employeeIdStr, 10);
    const siteId = siteIdStr ? parseInt(siteIdStr, 10) : undefined;

    const location: Coordinates = {
      latitude: coords.latitude,
      longitude: coords.longitude,
    };

    const timestampIso = timestamp ? new Date(timestamp).toISOString() : undefined;
    const result = await employeeApi.updateLiveLocation(employeeId, location, siteId, timestampIso);

    if (!result.success) {
      console.error('[LiveLocation] Failed to update location:', result.error);
    }

    return result.success;
  } catch (err: any) {
    console.error('[LiveLocation] Error sending location to server:', err);
    return false;
  }
}

async function sendCurrentLocation(): Promise<void> {
  try {
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    await sendLocationToServer(location.coords, location.timestamp);
  } catch (err) {
    // Silently fail
  }
}

async function tryStartBackgroundTracking(): Promise<boolean> {
  try {
    const isTaskDefined = TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK);
    if (!isTaskDefined) return false;

    const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)
      .catch(() => false);

    if (hasStarted) return true;

    // Start background tracking with foreground service (IMPORTANT for background reliability)
    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced, // Balanced for battery safety
      distanceInterval: BACKGROUND_DISTANCE_INTERVAL,
      timeInterval: BACKGROUND_TIME_INTERVAL,
      activityType: Location.ActivityType.Other,
      pausesUpdatesAutomatically: true,
      foregroundService: {
        notificationTitle: 'Attendance tracking active',
        notificationBody: 'Location updates every minute during check-in',
        notificationColor: '#2563eb',
      },
    });

    return true;
  } catch (error: any) {
    return false;
  }
}

async function stopBackgroundTracking(): Promise<void> {
  try {
    const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)
      .catch(() => false);

    if (hasStarted) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    }
  } catch (err) {
    // Ignore errors when stopping
  }
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Request location permissions
 */
export async function requestLocationPermissions(): Promise<boolean> {
  try {
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus !== 'granted') {
      return false;
    }

    // Request notifications permission (required for foreground service on Android 13+)
    if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
      try {
        const { PermissionsAndroid } = require('react-native');
        await PermissionsAndroid.request('android.permission.POST_NOTIFICATIONS', {
          title: 'Notification Permission',
          message: 'AIHP CrewTrack needs notification permission.',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        });
      } catch (err) {
        // Non-critical — ignore
      }
    }

    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Start live location tracking
 * IDEMPOTENT Logic added as per safeguards.
 */
export async function startLiveTracking(
  employeeId: number,
  siteId?: number
): Promise<boolean> {
  // Bridge to the single production tracking service.
  const result = await LocationTrackingService.checkInEmployee(employeeId, siteId);
  isTrackingActive = result.success;
  return result.success;

  /*
  try {
    // 1. IDEMPOTENCY CHECK: Avoid duplicate startups
    if (isTrackingActive) {
      const storedId = await AsyncStorage.getItem(STORAGE_KEYS.EMPLOYEE_ID);
      if (storedId === String(employeeId)) {
        // Already active for this employee, just ensure loops are running
        await tryStartBackgroundTracking();
        startForegroundSender();
        return true;
      } else {
        // Different employee! Must stop old session first
        await stopLiveTracking();
      }
    }

    // Request permissions (includes foreground, background, and notifications)
    const permissionsGranted = await requestLocationPermissions();
    if (!permissionsGranted) {
      // Background location is requested inside requestLocationPermissions,
      // but we only hard-fail if foreground is denied.
    }

    // 2. PERSIST CONTEXT
    await AsyncStorage.setItem(STORAGE_KEYS.EMPLOYEE_ID, employeeId.toString());
    if (siteId) {
      await AsyncStorage.setItem(STORAGE_KEYS.SITE_ID, siteId.toString());
    } else {
      await AsyncStorage.removeItem(STORAGE_KEYS.SITE_ID);
    }
    await AsyncStorage.setItem(STORAGE_KEYS.IS_TRACKING, 'true');

    // 3. INITIALIZE STATE & START LOOPS
    await initializeLocationState();

    // SAFEGUARDS: Start foreground service BEFORE starting sender loop
    const bgStarted = await tryStartBackgroundTracking();
    if (bgStarted) {
      startForegroundSender();
      isTrackingActive = true;
    }

    // 4. LISTENERS
    if (!appStateSubscription) {
      appStateSubscription = AppState.addEventListener('change', (next) => {
        // Log only, no service churn on state change
        // console.log(`[LiveLocation] AppState: ${next}`);
      });
    }

    return isTrackingActive;
  } catch (error) {
    isTrackingActive = false;
    return false;
  }
  */
}


/**
 * Stop live location tracking
 * IDEMPOTENT Logic added as per safeguards.
 */
export async function stopLiveTracking(): Promise<void> {
  // Bridge to the single production tracking service.
  await LocationTrackingService.checkOutEmployee();
  isTrackingActive = false;
  return;

  /*
  try {
    if (!isTrackingActive && !(await AsyncStorage.getItem(STORAGE_KEYS.IS_TRACKING))) {
      return; // Already stopped
    }

    // 1. STOP SENDER LOOP BEFORE STOPPING LOCATION UPDATES
    stopForegroundSender();

    // 2. STOP BACKGROUND TASK
    await stopBackgroundTracking();

    // 3. CLEAR STATE & PERSISTENCE
    clearLocationState();
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.IS_TRACKING,
      STORAGE_KEYS.EMPLOYEE_ID,
      STORAGE_KEYS.SITE_ID,
    ]);

    // 4. CLEANUP LISTENERS
    if (appStateSubscription) {
      appStateSubscription.remove();
      appStateSubscription = null;
    }

    // 5. SERVER CLEANUP
    const employeeIdStr = await AsyncStorage.getItem(STORAGE_KEYS.EMPLOYEE_ID);
    if (employeeIdStr) {
      employeeApi.clearLiveLocation(parseInt(employeeIdStr, 10)).catch(() => { });
    }

    isTrackingActive = false;
  } catch (error) {
    isTrackingActive = false;
  }
  */
}

/**
 * Resume tracking if it was active (after app restart)
 */
export async function resumeTrackingIfNeeded(): Promise<void> {
  // Bridge to the single production tracking service.
  await LocationTrackingService.resumeTrackingIfNeeded();
  return;

  /*
  try {
    const wasTracking = await AsyncStorage.getItem(STORAGE_KEYS.IS_TRACKING);
    const employeeIdStr = await AsyncStorage.getItem(STORAGE_KEYS.EMPLOYEE_ID);

    if (wasTracking === 'true' && employeeIdStr) {
      const employeeId = parseInt(employeeIdStr, 10);
      const siteIdStr = await AsyncStorage.getItem(STORAGE_KEYS.SITE_ID);
      const siteId = siteIdStr ? parseInt(siteIdStr, 10) : undefined;

      await startLiveTracking(employeeId, siteId);
    }
  } catch (error) {
    // console.warn('[LiveLocation] Resume failed', error);
  }
  */
}

/**
 * Force send current location immediately
 */
export async function forceLocationUpdate(): Promise<boolean> {
  // Bridge to the single production tracking service.
  await LocationTrackingService.forceOneTimeUpdate();
  return true;

  /*
  if (!isTrackingActive) {
    // Check if we should be tracking
    const wasTracking = await AsyncStorage.getItem(STORAGE_KEYS.IS_TRACKING);
    if (wasTracking !== 'true') {
      return false;
    }
  }

  try {
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    const success = await sendLocationToServer(location.coords, location.timestamp);
    return success;
  } catch (error) {
    return false;
  }
  */
}

/**
 * Check if tracking is active
 */
export async function isLiveTrackingActive(): Promise<boolean> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.IS_TRACKING);
    return stored === 'true';
  } catch {
    return false;
  }
}

/**
 * Get tracking status (sync version for UI)
 */
export function getTrackingStatus(): boolean {
  return isTrackingActive;
}
