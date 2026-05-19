/**
 * LocationTrackingService.ts
 *
 * Shares the foreground location cache with attendance so we keep a single
 * balanced-accuracy watcher alive while the app is active.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ATTENDANCE_GPS_ACCURACY_THRESHOLD } from '../constants/config';
import type { Coordinates } from '../types';
import { employeeApi } from './api';
import attendanceLocationManager from './attendanceLocationManager';

const THROTTLE_MS = 30000;
const MIN_DISTANCE_METERS = 5;
const HEARTBEAT_MS = 60000;
const LOCATION_CACHE_MAX_AGE_MS = 20000;
const LOCATION_TIMEOUT_MS = 4500;

const STORAGE_KEYS = {
  IS_TRACKING: '@LocSvc:isTracking',
  EMPLOYEE_ID: '@LocSvc:employeeId',
  SITE_ID: '@LocSvc:siteId',
  LAST_SENT_TS: '@LocSvc:lastSentTs',
  LAST_SENT_LAT: '@LocSvc:lastSentLat',
  LAST_SENT_LNG: '@LocSvc:lastSentLng',
  LAST_ERROR: '@LocSvc:lastError',
  LOGS: '@LocSvc:logs',
};

let isStartingTracking = false;
let isForceUpdatingLocation = false;
let isSendingForegroundLocation = false;
let locationUpdatesUnsubscribe: (() => void) | null = null;
let lastObservedLocationTimestamp = 0;
let lastSentTs = 0;
let lastSentLat: number | null = null;
let lastSentLng: number | null = null;

const MAX_LOGS = 80;

const log = async (message: string): Promise<void> => {
  try {
    const timestamp = new Date().toLocaleTimeString();
    const line = `[${timestamp}] ${message}`;
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.LOGS);
    let logs: string[] = raw ? JSON.parse(raw) : [];
    logs.unshift(line);
    if (logs.length > MAX_LOGS) {
      logs = logs.slice(0, MAX_LOGS);
    }
    await AsyncStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(logs));
  } catch {
    // Best effort only.
  }
};

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radius = 6371000;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function shouldSkipUpdate(latitude: number, longitude: number): boolean {
  const now = Date.now();
  const msSinceLast = now - lastSentTs;

  if (msSinceLast >= HEARTBEAT_MS) {
    return false;
  }

  if (msSinceLast < THROTTLE_MS && lastSentLat !== null && lastSentLng !== null) {
    const distance = haversineMeters(latitude, longitude, lastSentLat, lastSentLng);
    if (distance < MIN_DISTANCE_METERS) {
      return true;
    }
  }

  return false;
}

function recordSent(latitude: number, longitude: number): void {
  lastSentTs = Date.now();
  lastSentLat = latitude;
  lastSentLng = longitude;

  void AsyncStorage.multiSet([
    [STORAGE_KEYS.LAST_SENT_TS, String(lastSentTs)],
    [STORAGE_KEYS.LAST_SENT_LAT, String(latitude)],
    [STORAGE_KEYS.LAST_SENT_LNG, String(longitude)],
  ]).catch(() => {});
}

async function sendLocation(
  latitude: number,
  longitude: number,
  employeeId: number,
  siteId?: number
): Promise<void> {
  if (isSendingForegroundLocation) {
    return;
  }

  isSendingForegroundLocation = true;

  try {
    const result = await employeeApi.updateLiveLocation(
      employeeId,
      { latitude, longitude },
      siteId,
      new Date().toISOString()
    );

    if (result.success) {
      recordSent(latitude, longitude);
      await AsyncStorage.removeItem(STORAGE_KEYS.LAST_ERROR);
      await log('✅ Location sent');
      return;
    }

    await log(`❌ API error: ${result.error}`);
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_ERROR, result.error || 'Unknown');
  } catch (error: any) {
    await log(`❌ Network error: ${error?.message || 'Unknown error'}`);
    await AsyncStorage.setItem(
      STORAGE_KEYS.LAST_ERROR,
      error?.message || 'Network error'
    );
  } finally {
    isSendingForegroundLocation = false;
  }
}

async function requestPermissions(): Promise<boolean> {
  const granted = await attendanceLocationManager.requestPermission();

  if (!granted) {
    await log('❌ Foreground permission denied');
  }

  return granted;
}

async function startForegroundFeed(employeeId: number, siteId?: number): Promise<void> {
  stopForegroundFeed();
  await attendanceLocationManager.start();

  locationUpdatesUnsubscribe = attendanceLocationManager.subscribeToLocationUpdates(
    (snapshot) => {
      if (snapshot.timestamp <= lastObservedLocationTimestamp) {
        return;
      }

      lastObservedLocationTimestamp = snapshot.timestamp;
      const { latitude, longitude } = snapshot.coordinates;

      if (shouldSkipUpdate(latitude, longitude)) {
        return;
      }

      void sendLocation(latitude, longitude, employeeId, siteId);
    }
  );

  await log('📍 Foreground location feed started');
}

function stopForegroundFeed(): void {
  if (locationUpdatesUnsubscribe) {
    locationUpdatesUnsubscribe();
    locationUpdatesUnsubscribe = null;
    void log('🛑 Foreground location feed stopped');
  }

  lastObservedLocationTimestamp = 0;
}

const LocationTrackingService = {
  async _cleanupLegacyTaskIfRunning(): Promise<void> {
    try {
      const { hasStartedLocationUpdatesAsync, stopLocationUpdatesAsync } =
        require('expo-location') as typeof import('expo-location');

      const legacyTasks = ['BACKGROUND_LOC_TASK', 'AIHP_BACKGROUND_LOCATION_TRACKING'];
      for (const task of legacyTasks) {
        try {
          const running = await hasStartedLocationUpdatesAsync(task).catch(() => false);
          if (running) {
            await stopLocationUpdatesAsync(task).catch(() => {});
            await log(`🧹 Stopped legacy task: ${task}`);
          }
        } catch {
          // Ignore legacy task cleanup failures.
        }
      }

      await AsyncStorage.multiRemove([
        '@liveLocation:isTracking',
        '@liveLocation:employeeId',
        '@liveLocation:siteId',
      ]).catch(() => {});
    } catch {
      // Best effort cleanup only.
    }
  },

  async checkInEmployee(
    employeeId: number,
    siteId?: number,
    initialLocation?: Coordinates
  ): Promise<{ success: boolean; error?: string }> {
    if (isStartingTracking) {
      await log('⚠️ checkInEmployee called while already starting — ignored');
      return { success: true };
    }

    isStartingTracking = true;

    try {
      await log(`🚀 Check-in: employee=${employeeId} site=${siteId ?? 'none'}`);
      await this._cleanupLegacyTaskIfRunning();
      await attendanceLocationManager.start();

      const hasPermission = await requestPermissions();
      if (!hasPermission) {
        return { success: false, error: 'Location permission is required.' };
      }

      await AsyncStorage.setItem(STORAGE_KEYS.EMPLOYEE_ID, employeeId.toString());
      await AsyncStorage.setItem(STORAGE_KEYS.IS_TRACKING, 'true');

      if (siteId) {
        await AsyncStorage.setItem(STORAGE_KEYS.SITE_ID, siteId.toString());
      } else {
        await AsyncStorage.removeItem(STORAGE_KEYS.SITE_ID);
      }

      if (initialLocation) {
        await sendLocation(initialLocation.latitude, initialLocation.longitude, employeeId, siteId);
      } else {
        await this.forceOneTimeUpdate();
      }

      await startForegroundFeed(employeeId, siteId);
      await log('🎉 Check-in complete');
      return { success: true };
    } catch (error: any) {
      await log(`❌ Check-in error: ${error?.message || 'Unknown error'}`);
      return {
        success: false,
        error: error?.message || 'Failed to start tracking',
      };
    } finally {
      isStartingTracking = false;
    }
  },

  async checkOutEmployee(): Promise<void> {
    await log('🛑 Check-out: stopping tracking');
    stopForegroundFeed();

    lastSentTs = 0;
    lastSentLat = null;
    lastSentLng = null;
    isSendingForegroundLocation = false;

    await AsyncStorage.multiRemove([
      STORAGE_KEYS.IS_TRACKING,
      STORAGE_KEYS.EMPLOYEE_ID,
      STORAGE_KEYS.SITE_ID,
      STORAGE_KEYS.LAST_SENT_TS,
      STORAGE_KEYS.LAST_SENT_LAT,
      STORAGE_KEYS.LAST_SENT_LNG,
    ]).catch(() => {});

    await log('✅ Check-out complete');
  },

  async resumeTrackingIfNeeded(): Promise<void> {
    try {
      await this._cleanupLegacyTaskIfRunning();

      const [isTracking, employeeIdStr, siteIdStr] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.IS_TRACKING),
        AsyncStorage.getItem(STORAGE_KEYS.EMPLOYEE_ID),
        AsyncStorage.getItem(STORAGE_KEYS.SITE_ID),
      ]);

      if (isTracking !== 'true' || !employeeIdStr) {
        return;
      }

      const employeeId = parseInt(employeeIdStr, 10);
      const siteId = siteIdStr ? parseInt(siteIdStr, 10) : undefined;

      await log(`🔄 Resume tracking for employee=${employeeId}`);
      await this.checkInEmployee(employeeId, siteId);
    } catch (error: any) {
      await log(`❌ Resume failed: ${error?.message || 'Unknown error'}`);
    }
  },

  async forceOneTimeUpdate(): Promise<void> {
    if (isForceUpdatingLocation) {
      return;
    }

    isForceUpdatingLocation = true;

    try {
      const employeeIdStr = await AsyncStorage.getItem(STORAGE_KEYS.EMPLOYEE_ID);
      if (!employeeIdStr) {
        return;
      }

      const employeeId = parseInt(employeeIdStr, 10);
      const siteIdStr = await AsyncStorage.getItem(STORAGE_KEYS.SITE_ID);
      const siteId = siteIdStr ? parseInt(siteIdStr, 10) : undefined;

      const snapshot = await attendanceLocationManager.getCurrentLocationSnapshot({
        preferCached: true,
        targetAccuracy: ATTENDANCE_GPS_ACCURACY_THRESHOLD,
        maxAgeMs: LOCATION_CACHE_MAX_AGE_MS,
        timeoutMs: LOCATION_TIMEOUT_MS,
        retryCount: 1,
        allowStaleFallback: true,
      });

      if (!snapshot) {
        return;
      }

      await sendLocation(
        snapshot.coordinates.latitude,
        snapshot.coordinates.longitude,
        employeeId,
        siteId
      );
    } catch (error: any) {
      await log(`❌ Force update error: ${error?.message || 'Unknown error'}`);
    } finally {
      isForceUpdatingLocation = false;
    }
  },

  async isTrackingActive(): Promise<boolean> {
    try {
      const flag = await AsyncStorage.getItem(STORAGE_KEYS.IS_TRACKING);
      return flag === 'true' && locationUpdatesUnsubscribe !== null;
    } catch {
      return false;
    }
  },

  async getLastSentTimestamp(): Promise<string | null> {
    return AsyncStorage.getItem(STORAGE_KEYS.LAST_SENT_TS).catch(() => null);
  },

  async getLastError(): Promise<string | null> {
    return AsyncStorage.getItem(STORAGE_KEYS.LAST_ERROR).catch(() => null);
  },

  async getLogs(): Promise<string[]> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.LOGS);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  async clearLogs(): Promise<void> {
    await AsyncStorage.removeItem(STORAGE_KEYS.LOGS).catch(() => {});
  },
};

export default LocationTrackingService;
