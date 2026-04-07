import { getLatestLocation, getLastSentTimestamp, getLastSentCoords, markLocationSent } from './locationState';
import { employeeApi } from './api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { calculateDistance } from '../utils/geofence';

// CONFIGURATION
const SEND_INTERVAL_MS = 30000; // Send once per 30 seconds
const MOVE_THRESHOLD_METERS = 5; // Only send if moved > 5m
const HEARTBEAT_INTERVAL_MS = 60000; // Force update every 1 minute even if stationary

const STORAGE_KEYS = {
    EMPLOYEE_ID: '@liveLocation:employeeId',
    SITE_ID: '@liveLocation:siteId',
};

// STATE
let sendInterval: NodeJS.Timeout | null = null;
let isSending = false;

/**
 * Start the foreground sender loop.
 * IDEMPOTENT: If already running, does nothing.
 */
export function startForegroundSender(): void {
    if (sendInterval) return;

    // Run first attempt immediately (but it will likely skip if no location yet)
    attemptSend();

    sendInterval = setInterval(() => {
        attemptSend();
    }, SEND_INTERVAL_MS);
}

/**
 * Stop the foreground sender loop.
 */
export function stopForegroundSender(): void {
    if (sendInterval) {
        clearInterval(sendInterval);
        sendInterval = null;
    }
    isSending = false;
}

/**
 * The main send logic with mandatory safeguards.
 */
async function attemptSend(): Promise<void> {
    // 1. CONCURRENCY GUARD: Pre-empt if already sending
    if (isSending) return;

    try {
        // 2. CONTEXT GUARD: Must be checked in
        const employeeIdStr = await AsyncStorage.getItem(STORAGE_KEYS.EMPLOYEE_ID);
        if (!employeeIdStr) return;
        const employeeId = parseInt(employeeIdStr, 10);

        const siteIdStr = await AsyncStorage.getItem(STORAGE_KEYS.SITE_ID);
        const siteId = siteIdStr ? parseInt(siteIdStr, 10) : undefined;

        // 3. DATA GUARD: Latest valid location must exist
        const latest = getLatestLocation();
        if (!latest) return;

        // 4. COOLDOWN/ACCURACY GUARD
        const now = Date.now();
        const lastSentAt = getLastSentTimestamp();
        if (now - lastSentAt < SEND_INTERVAL_MS - 5000) return; // Allow 5s buffer
        if (latest.accuracy && latest.accuracy > 200) return;

        // 5. HEARTBEAT & MOVE FILTER
        let shouldSend = false;
        const lastSentCoords = getLastSentCoords();

        // Force send if it's been more than HEARTBEAT_INTERVAL_MS since the last send
        // This ensures the Admin sees "Just now" even if the employee is stationary.
        if (now - lastSentAt >= HEARTBEAT_INTERVAL_MS) {
            shouldSend = true;
        }
        // Otherwise, check for significant movement
        else if (lastSentCoords) {
            const distance = calculateDistance(
                { latitude: lastSentCoords.latitude, longitude: lastSentCoords.longitude },
                { latitude: latest.latitude, longitude: latest.longitude }
            );
            if (distance >= MOVE_THRESHOLD_METERS) {
                shouldSend = true;
            }
        } else {
            // First time sending
            shouldSend = true;
        }

        if (!shouldSend) return;

        // 6. EXECUTE SEND
        isSending = true;
        const timestampIso = new Date(latest.timestamp).toISOString();

        const response = await employeeApi.updateLiveLocation(
            employeeId,
            { latitude: latest.latitude, longitude: latest.longitude },
            siteId,
            timestampIso
        );

        if (response.success) {
            markLocationSent(latest.latitude, latest.longitude, latest.timestamp);
            // console.log(`[ForegroundSender] SUCCESS: Updated Supabase at ${new Date().toLocaleTimeString()}`);
        }
    } catch (err) {
        // Silently catch network errors
    } finally {
        isSending = false;
    }
}
