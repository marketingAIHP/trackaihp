/**
 * Background Location Task
 *
 * This task is registered with expo-task-manager and runs in the background
 * via Android's Headless JS when the app is minimized.
 *
 * IMPORTANT:
 * - This file MUST be imported at the root level (index.js)
 * - TaskManager.defineTask MUST be called at module evaluation time
 * - The foreground service keeps this task alive when app is backgrounded
 */

import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { updateLocation, getLastSentTimestamp, getLastSentCoords, markLocationSent } from './locationState';
import { calculateDistance, checkGeofence } from '../utils/geofence';
import type { WorkSite } from '../types';
import { employeeApi } from './api';
import { createHeadlessSupabaseClient } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    CONTINUOUS_LOCATION_INTERVALS,
    CONTINUOUS_LOCATION_STORAGE_KEYS,
    CONTINUOUS_LOCATION_TASK,
} from './continuousLocationConfig';

// Configuration (aligned with foregroundSender)
const SEND_INTERVAL_MS = CONTINUOUS_LOCATION_INTERVALS.timeMs;
const MOVE_THRESHOLD_METERS = CONTINUOUS_LOCATION_INTERVALS.distanceMeters;
const BACKGROUND_UPLOAD_TIMEOUT_MS = 20000;

async function withBackgroundUploadTimeout<T>(operation: Promise<T>): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
        return await Promise.race([
            operation,
            new Promise<never>((_, reject) => {
                timeoutId = setTimeout(
                    () => reject(new Error('Background location upload timed out')),
                    BACKGROUND_UPLOAD_TIMEOUT_MS
                );
            }),
        ]);
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
}

// Task name - must match startLocationUpdatesAsync
export const BACKGROUND_LOCATION_TASK = CONTINUOUS_LOCATION_TASK;
let isBackgroundUploadInFlight = false;

/**
 * Background Location Task (GPS COLLECTION ONLY)
 *
 * SAFEGUARDS:
 * 1. NO network calls allowed here.
 * 2. Return immediately after updating local state.
 * 3. Fast execution to avoid Android OS penalties.
 */
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
    if (error) {
        // Minimal logging for critical errors
        console.error('[ContinuousLocation] background task error', error);
        return;
    }

    if (!data) return;

    const { locations } = data as { locations: any[] };
    if (!locations || locations.length === 0) return;

    try {
        // Get the most recent location
        const latest = locations[0];
        const coords = latest.coords;
        const gpsTimestamp = latest.timestamp || Date.now();

        // Update local state ONLY (safeguards are inside updateLocation)
        const updated = await updateLocation(
            coords.latitude,
            coords.longitude,
            coords.accuracy || null,
            gpsTimestamp
        );

        if (!updated) return;

        // --- BACKGROUND SENDING LOGIC ---
        // 1. Cooldown Check
        const now = Date.now();
        const lastSentAt = getLastSentTimestamp();
        if (now - lastSentAt < SEND_INTERVAL_MS - 5000) return; // 5s buffer

        // 2. Movement Check
        const lastSentCoords = getLastSentCoords();
        let shouldSend = now - lastSentAt >= CONTINUOUS_LOCATION_INTERVALS.heartbeatMs;

        if (!lastSentCoords) {
            shouldSend = true;
        } else {
            const distance = calculateDistance(
                { latitude: coords.latitude, longitude: coords.longitude },
                lastSentCoords
            );
            if (!shouldSend && distance >= MOVE_THRESHOLD_METERS) {
                shouldSend = true;
            }
        }

        // 3. Attempt Send
        if (shouldSend) {
            if (isBackgroundUploadInFlight) {
                console.log('[ContinuousLocation] location upload skipped', {
                    reason: 'Previous background upload is still active',
                });
                return;
            }

            const [isTracking, employeeId] = await Promise.all([
                AsyncStorage.getItem(CONTINUOUS_LOCATION_STORAGE_KEYS.isTracking),
                AsyncStorage.getItem(CONTINUOUS_LOCATION_STORAGE_KEYS.employeeId),
            ]);
            if (isTracking !== 'true' || !employeeId) {
                console.log('[ContinuousLocation] location upload skipped', {
                    reason: 'Tracking context is missing',
                });
                return;
            }

            if (employeeId) {
                const siteContextJson = await AsyncStorage.getItem(
                    CONTINUOUS_LOCATION_STORAGE_KEYS.siteContext
                );
                const timestampIso = new Date(gpsTimestamp).toISOString();
                let isOnSite: boolean | undefined;

                if (siteContextJson) {
                    try {
                        const siteContext = JSON.parse(siteContextJson) as WorkSite;
                        isOnSite = checkGeofence(
                            { latitude: coords.latitude, longitude: coords.longitude },
                            siteContext
                        ).isWithinGeofence;
                    } catch {
                        console.warn('[ContinuousLocation] optional metadata lookup failed', {
                            reason: 'Stored site context is invalid',
                        });
                    }
                }

                console.log('[ContinuousLocation] background location received', {
                    timestamp: timestampIso,
                    accuracy: coords.accuracy ?? null,
                });
                console.log('[ContinuousLocation] updateLiveLocation started');
                const headlessSupabase = await createHeadlessSupabaseClient();

                isBackgroundUploadInFlight = true;
                const response = await withBackgroundUploadTimeout(
                    employeeApi.updateBackgroundLiveLocation(
                        parseInt(employeeId, 10),
                        { latitude: coords.latitude, longitude: coords.longitude },
                        isOnSite,
                        timestampIso,
                        headlessSupabase
                    )
                );
                isBackgroundUploadInFlight = false;

                if (response.success) {
                    markLocationSent(coords.latitude, coords.longitude, gpsTimestamp);
                    console.log('[ContinuousLocation] updateLiveLocation completed');
                } else {
                    console.warn('[ContinuousLocation] location upload failed', {
                        error: response.error || 'Unknown error',
                    });
                    console.log('[ContinuousLocation] updateLiveLocation completed');

                    if (response.error === 'Not currently checked in') {
                        console.log('[ContinuousLocation] active attendance missing; stopping task');
                        const started = await Location.hasStartedLocationUpdatesAsync(CONTINUOUS_LOCATION_TASK)
                            .catch(() => false);
                        if (started) {
                            await Location.stopLocationUpdatesAsync(CONTINUOUS_LOCATION_TASK).catch(() => undefined);
                        }
                        await AsyncStorage.multiRemove([
                            CONTINUOUS_LOCATION_STORAGE_KEYS.isTracking,
                            CONTINUOUS_LOCATION_STORAGE_KEYS.employeeId,
                            CONTINUOUS_LOCATION_STORAGE_KEYS.attendanceId,
                            CONTINUOUS_LOCATION_STORAGE_KEYS.siteId,
                            CONTINUOUS_LOCATION_STORAGE_KEYS.siteContext,
                        ]).catch(() => undefined);
                    }
                }
            }
        }
    } catch (err: any) {
        isBackgroundUploadInFlight = false;
        console.warn('[ContinuousLocation] location upload failed', {
            error: err?.message || 'Unknown error',
        });
        console.log('[ContinuousLocation] updateLiveLocation completed');
    }
});
