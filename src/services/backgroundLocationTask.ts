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
import { updateLocation, getLastSentTimestamp, getLastSentCoords, markLocationSent } from './locationState';
import { calculateDistance } from '../utils/geofence';
import { employeeApi } from './api';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Configuration (aligned with foregroundSender)
const SEND_INTERVAL_MS = 30000;
const MOVE_THRESHOLD_METERS = 5;

// Task name - must match startLocationUpdatesAsync
export const BACKGROUND_LOCATION_TASK = 'AIHP_BACKGROUND_LOCATION_TRACKING';

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
        console.error(`[BackgroundTask] ERROR:`, error);
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
        let shouldSend = false;

        if (!lastSentCoords) {
            shouldSend = true;
        } else {
            const distance = calculateDistance(
                { latitude: coords.latitude, longitude: coords.longitude },
                lastSentCoords
            );
            if (distance >= MOVE_THRESHOLD_METERS) {
                shouldSend = true;
            }
        }

        // 3. Attempt Send
        if (shouldSend) {
            const employeeId = await AsyncStorage.getItem('@liveLocation:employeeId');
            if (employeeId) {
                const siteId = await AsyncStorage.getItem('@liveLocation:siteId');
                const timestampIso = new Date(gpsTimestamp).toISOString();

                // Fire and forget send
                employeeApi.updateLiveLocation(
                    parseInt(employeeId, 10),
                    { latitude: coords.latitude, longitude: coords.longitude },
                    siteId ? parseInt(siteId, 10) : undefined,
                    timestampIso
                ).then(res => {
                    if (res.success) {
                        markLocationSent(coords.latitude, coords.longitude, gpsTimestamp);
                    }
                }).catch(() => { });
            }
        }
    } catch (err: any) {
        // Silently catch exceptions to prevent task crashes
    }
});
