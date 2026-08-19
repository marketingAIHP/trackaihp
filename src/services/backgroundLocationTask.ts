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
import { calculateDistance } from '../utils/geofence';
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
            const employeeId = await AsyncStorage.getItem(CONTINUOUS_LOCATION_STORAGE_KEYS.employeeId);
            if (employeeId) {
                const siteId = await AsyncStorage.getItem(CONTINUOUS_LOCATION_STORAGE_KEYS.siteId);
                const timestampIso = new Date(gpsTimestamp).toISOString();

                console.log('[ContinuousLocation] background location received', {
                    timestamp: timestampIso,
                    accuracy: coords.accuracy ?? null,
                });
                console.log('[ContinuousLocation] updateLiveLocation started');
                const headlessSupabase = await createHeadlessSupabaseClient();

                const response = await withBackgroundUploadTimeout(
                    employeeApi.updateLiveLocation(
                        parseInt(employeeId, 10),
                        { latitude: coords.latitude, longitude: coords.longitude },
                        siteId ? parseInt(siteId, 10) : undefined,
                        timestampIso,
                        {
                            skipReverseGeocoding: true,
                            backgroundDiagnostics: true,
                            databaseClient: headlessSupabase,
                        }
                    )
                );

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
                            CONTINUOUS_LOCATION_STORAGE_KEYS.siteId,
                        ]).catch(() => undefined);
                    }
                }
            }
        }
    } catch (err: any) {
        console.warn('[ContinuousLocation] location upload failed', {
            error: err?.message || 'Unknown error',
        });
        console.log('[ContinuousLocation] updateLiveLocation completed');
    }
});
