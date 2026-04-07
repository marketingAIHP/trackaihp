/**
 * LocationTrackingService.ts — FOREGROUND-ONLY ARCHITECTURE
 *
 * Tracks employee location while the app is in the foreground (checked in).
 * No background tasks, no TaskManager, no foreground service notification.
 *
 * ARCHITECTURE:
 * ┌─────────────────────────────────────────────────────────┐
 * │  watchPositionAsync (foreground-only, Balanced accuracy) │
 * │  → location updates arrive as employee moves             │
 * │  → throttle: skip DB write if < THROTTLE_MS ago         │
 * │  → dedup: skip if coords unchanged (< MIN_DISTANCE_M)   │
 * │  → sends ONE upsert to Supabase                          │
 * └─────────────────────────────────────────────────────────┘
 *
 * Benefits:
 * - No battery drain in background
 * - No broken Android background task issues
 * - Simpler, more reliable code
 *
 * THROTTLE: 30 seconds minimum between DB writes
 * DEDUP: Skip if lat/lng within 5m AND within throttle window
 */

import * as Location from 'expo-location';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { employeeApi } from './api';
import { Coordinates } from '../types';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Minimum ms between actual DB inserts */
const THROTTLE_MS = 30000;

/** Minimum metres movement to count as a new location */
const MIN_DISTANCE_METERS = 5;

/** How often the watchPosition loop fires (OS-level) */
const WATCH_TIME_INTERVAL_MS = 10000; // 10 seconds

/** When stationary, force a heartbeat update every N ms */
const HEARTBEAT_MS = 60000; // 1 minute

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

// =============================================================================
// MODULE-LEVEL STATE
// =============================================================================

let isStartingTracking = false;
let appStateSubscription: any = null;
let watchSubscription: Location.LocationSubscription | null = null;
let lastSentTs = 0;
let lastSentLat: number | null = null;
let lastSentLng: number | null = null;

// =============================================================================
// LOGGING HELPER
// =============================================================================

const MAX_LOGS = 80;

const log = async (msg: string): Promise<void> => {
  try {
    const ts = new Date().toLocaleTimeString();
    const line = `[${ts}] ${msg}`;
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.LOGS);
    let logs: string[] = raw ? JSON.parse(raw) : [];
    logs.unshift(line);
    if (logs.length > MAX_LOGS) logs = logs.slice(0, MAX_LOGS);
    await AsyncStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(logs));
  } catch { /* ignore */ }
};

// =============================================================================
// HAVERSINE DISTANCE
// =============================================================================

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// =============================================================================
// THROTTLE / DEDUP LOGIC (in-memory, fast)
// =============================================================================

function shouldSkipUpdate(lat: number, lng: number): boolean {
  const now = Date.now();
  const msSinceLast = now - lastSentTs;

  // Heartbeat: always send if it's been > HEARTBEAT_MS (stationary employees)
  if (msSinceLast >= HEARTBEAT_MS) return false;

  // Throttle window not expired
  if (msSinceLast < THROTTLE_MS) {
    // Within throttle window — skip unless moved enough
    if (lastSentLat !== null && lastSentLng !== null) {
      const dist = haversineMeters(lat, lng, lastSentLat, lastSentLng);
      if (dist < MIN_DISTANCE_METERS) return true;
    }
  }

  return false;
}

function recordSent(lat: number, lng: number): void {
  lastSentTs = Date.now();
  lastSentLat = lat;
  lastSentLng = lng;
  void AsyncStorage.multiSet([
    [STORAGE_KEYS.LAST_SENT_TS, String(lastSentTs)],
    [STORAGE_KEYS.LAST_SENT_LAT, String(lat)],
    [STORAGE_KEYS.LAST_SENT_LNG, String(lng)],
  ]).catch(() => { });
}

// =============================================================================
// FAST LOCATION ACQUISITION — race Balanced vs High, take the fastest
// =============================================================================

async function getFastCurrentLocation(): Promise<Location.LocationObject> {
  const cached = await Location.getLastKnownPositionAsync({
    maxAge: 10000,
    requiredAccuracy: 35,
  });
  if (cached) return cached;

  const balancedPromise = Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  const highPromise = Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });

  const first = await Promise.race([balancedPromise, highPromise]);
  const firstAccuracy = first.coords.accuracy ?? Infinity;

  if (firstAccuracy <= 20) {
    return first;
  }

  try {
    const better = await Promise.race([
      highPromise,
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      }),
    ]);
    return (better.coords.accuracy ?? Infinity) <= firstAccuracy ? better : first;
  } catch {
    return first;
  }
}

// =============================================================================
// SEND LOCATION TO SERVER
// =============================================================================

async function sendLocation(lat: number, lng: number, employeeId: number, siteId?: number): Promise<void> {
  const timestamp = new Date().toISOString();
  try {
    const result = await employeeApi.updateLiveLocation(
      employeeId,
      { latitude: lat, longitude: lng },
      siteId,
      timestamp,
    );

    if (result.success) {
      recordSent(lat, lng);
      await AsyncStorage.removeItem(STORAGE_KEYS.LAST_ERROR);
      await log(`✅ Location sent`);
    } else {
      await log(`❌ API error: ${result.error}`);
      await AsyncStorage.setItem(STORAGE_KEYS.LAST_ERROR, result.error || 'Unknown');
    }
  } catch (err: any) {
    await log(`❌ Network error: ${err.message}`);
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_ERROR, err.message || 'Network error');
  }
}

// =============================================================================
// WATCH POSITION (foreground only)
// =============================================================================

async function startForegroundWatch(employeeId: number, siteId?: number): Promise<void> {
  // Stop any existing watch first
  stopForegroundWatch();

  watchSubscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: WATCH_TIME_INTERVAL_MS,
      distanceInterval: 0, // Deliver time-based updates; throttle handled by us
    },
    async (location) => {
      const { latitude, longitude } = location.coords;

      if (shouldSkipUpdate(latitude, longitude)) {
        return;
      }

      await sendLocation(latitude, longitude, employeeId, siteId);
    },
  );

  await log('📍 Foreground watch started');
}

function stopForegroundWatch(): void {
  if (watchSubscription) {
    watchSubscription.remove();
    watchSubscription = null;
    log('🛑 Foreground watch stopped');
  }
}

// =============================================================================
// PERMISSIONS (foreground only — no background permission needed)
// =============================================================================

async function requestPermissions(): Promise<boolean> {
  const { status: fg } = await Location.requestForegroundPermissionsAsync();
  if (fg !== 'granted') {
    await log('❌ Foreground permission denied');
    return false;
  }
  return true;
}

// =============================================================================
// PUBLIC SERVICE
// =============================================================================

const LocationTrackingService = {

  /**
   * Stop any legacy background task that may still be running from old app builds.
   */
  async _cleanupLegacyTaskIfRunning(): Promise<void> {
    try {
      const { hasStartedLocationUpdatesAsync, stopLocationUpdatesAsync } =
        require('expo-location') as typeof Location;

      const LEGACY_TASKS = ['BACKGROUND_LOC_TASK', 'AIHP_BACKGROUND_LOCATION_TRACKING'];
      for (const task of LEGACY_TASKS) {
        try {
          const running = await hasStartedLocationUpdatesAsync(task).catch(() => false);
          if (running) {
            await stopLocationUpdatesAsync(task).catch(() => { });
            await log(`🧹 Stopped legacy task: ${task}`);
          }
        } catch { /* ignore */ }
      }

      // Clean up old storage keys used by the legacy tasks
      await AsyncStorage.multiRemove([
        '@liveLocation:isTracking',
        '@liveLocation:employeeId',
        '@liveLocation:siteId',
      ]).catch(() => { });
    } catch {
      // Best-effort cleanup
    }
  },

  /**
   * Start foreground location tracking on check-in.
   */
  async checkInEmployee(employeeId: number, siteId?: number): Promise<{ success: boolean; error?: string }> {
    if (isStartingTracking) {
      await log('⚠️ checkInEmployee called while already starting — ignored');
      return { success: true };
    }

    isStartingTracking = true;

    try {
      await log(`🚀 Check-in: employee=${employeeId} site=${siteId ?? 'none'}`);

      // Stop any legacy background task from old builds
      await this._cleanupLegacyTaskIfRunning();

      // 1. Foreground permission only
      const hasPerm = await requestPermissions();
      if (!hasPerm) {
        return { success: false, error: 'Location permission is required.' };
      }

      // 2. Persist context
      await AsyncStorage.setItem(STORAGE_KEYS.EMPLOYEE_ID, employeeId.toString());
      await AsyncStorage.setItem(STORAGE_KEYS.IS_TRACKING, 'true');
      if (siteId) {
        await AsyncStorage.setItem(STORAGE_KEYS.SITE_ID, siteId.toString());
      } else {
        await AsyncStorage.removeItem(STORAGE_KEYS.SITE_ID);
      }

      // 3. Send first update immediately (fast race strategy)
      await this.forceOneTimeUpdate();

      // 4. Start foreground watch loop
      await startForegroundWatch(employeeId, siteId);

      // 5. AppState listener — pause/resume watch on background/foreground
      this._startAppStateListener(employeeId, siteId);

      await log('🎉 Check-in complete (foreground-only tracking)');
      return { success: true };

    } catch (err: any) {
      await log(`❌ Check-in error: ${err.message}`);
      return { success: false, error: err.message || 'Failed to start tracking' };
    } finally {
      isStartingTracking = false;
    }
  },

  /**
   * Stop tracking on check-out.
   */
  async checkOutEmployee(): Promise<void> {
    await log('🛑 Check-out: stopping tracking');

    this._stopAppStateListener();
    stopForegroundWatch();

    // Reset in-memory throttle
    lastSentTs = 0;
    lastSentLat = null;
    lastSentLng = null;

    await AsyncStorage.multiRemove([
      STORAGE_KEYS.IS_TRACKING,
      STORAGE_KEYS.EMPLOYEE_ID,
      STORAGE_KEYS.SITE_ID,
      STORAGE_KEYS.LAST_SENT_TS,
      STORAGE_KEYS.LAST_SENT_LAT,
      STORAGE_KEYS.LAST_SENT_LNG,
    ]);

    await log('✅ Check-out complete');
  },

  /**
   * Resume foreground tracking after app restart if employee is still checked in.
   */
  async resumeTrackingIfNeeded(): Promise<void> {
    try {
      await this._cleanupLegacyTaskIfRunning();

      const [isTracking, employeeIdStr, siteIdStr] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.IS_TRACKING),
        AsyncStorage.getItem(STORAGE_KEYS.EMPLOYEE_ID),
        AsyncStorage.getItem(STORAGE_KEYS.SITE_ID),
      ]);

      if (isTracking !== 'true' || !employeeIdStr) return;

      const employeeId = parseInt(employeeIdStr, 10);
      const siteId = siteIdStr ? parseInt(siteIdStr, 10) : undefined;

      await log(`🔄 Resume tracking for employee=${employeeId}`);
      await this.checkInEmployee(employeeId, siteId);
    } catch (err: any) {
      await log(`❌ Resume failed: ${err?.message || 'Unknown error'}`);
    }
  },

  /**
   * Send one location update immediately (fast race strategy).
   * Used on check-in start and when app returns to foreground.
   */
  async forceOneTimeUpdate(): Promise<void> {
    try {
      const employeeIdStr = await AsyncStorage.getItem(STORAGE_KEYS.EMPLOYEE_ID);
      if (!employeeIdStr) return;

      const employeeId = parseInt(employeeIdStr, 10);
      const siteIdStr = await AsyncStorage.getItem(STORAGE_KEYS.SITE_ID);
      const siteId = siteIdStr ? parseInt(siteIdStr, 10) : undefined;

      const location = await getFastCurrentLocation();
      const { latitude, longitude } = location.coords;

      // Bypass throttle — this is an explicit force update
      await sendLocation(latitude, longitude, employeeId, siteId);
    } catch (err: any) {
      await log(`❌ Force update error: ${err.message}`);
    }
  },

  /** Whether tracking is currently active */
  async isTrackingActive(): Promise<boolean> {
    try {
      const flag = await AsyncStorage.getItem(STORAGE_KEYS.IS_TRACKING);
      return flag === 'true' && watchSubscription !== null;
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
    } catch { return []; }
  },

  async clearLogs(): Promise<void> {
    await AsyncStorage.removeItem(STORAGE_KEYS.LOGS).catch(() => { });
  },

  // ---------------------------------------------------------------------------
  // PRIVATE: AppState listener — pause watch when backgrounded, resume on foreground
  // ---------------------------------------------------------------------------

  _startAppStateListener(employeeId: number, siteId?: number): void {
    this._stopAppStateListener();

    appStateSubscription = AppState.addEventListener('change', async (nextState) => {
      if (nextState === 'active') {
        await log('📱 App came to foreground — resuming location watch');
        // Restart the watch if it was stopped when the app went to background
        if (!watchSubscription) {
          await startForegroundWatch(employeeId, siteId);
        }
        // Send an immediate update so admin sees fresh location right away
        await LocationTrackingService.forceOneTimeUpdate();
      } else if (nextState === 'background') {
        await log('📱 App went to background — pausing location watch (saves battery)');
        stopForegroundWatch();
      }
    });

    log('📱 AppState listener started');
  },

  _stopAppStateListener(): void {
    if (appStateSubscription) {
      appStateSubscription.remove();
      appStateSubscription = null;
    }
  },
};

export default LocationTrackingService;
