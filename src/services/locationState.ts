import AsyncStorage from '@react-native-async-storage/async-storage';

export interface LocationState {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    timestamp: number;
}

const STORAGE_KEY = '@locationState:latestLocation';

let currentLocation: LocationState | null = null;
let lastSentTimestamp: number = 0;
let lastSentCoords: { latitude: number; longitude: number } | null = null;
let isInitialized = false;

/**
 * Initialize location state from storage
 */
export async function initializeLocationState(): Promise<void> {
    if (isInitialized) return;
    try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
            currentLocation = JSON.parse(stored);
        }

        const storedSent = await AsyncStorage.getItem('@locationState:lastSent');
        if (storedSent) {
            const parsed = JSON.parse(storedSent);
            lastSentTimestamp = parsed.timestamp;
            lastSentCoords = { latitude: parsed.latitude, longitude: parsed.longitude };
        }

        isInitialized = true;
    } catch (err) {
        // Silently fail to maintain execution speed in background
    }
}

/**
 * Get the latest valid location fix
 */
export function getLatestLocation(): LocationState | null {
    return currentLocation;
}

/**
 * Get the timestamp when a location was last successfully sent
 */
export function getLastSentTimestamp(): number {
    return lastSentTimestamp;
}

/**
 * Get the coordinates that were last successfully sent
 */
export function getLastSentCoords(): { latitude: number; longitude: number } | null {
    return lastSentCoords;
}

/**
 * Mark a location as successfully sent
 */
export function markLocationSent(latitude: number, longitude: number, timestamp: number): void {
    lastSentTimestamp = timestamp;
    lastSentCoords = { latitude, longitude };

    // Save sent state (optional, but good for persistence across app restarts)
    AsyncStorage.setItem('@locationState:lastSent', JSON.stringify({
        latitude,
        longitude,
        timestamp
    })).catch(() => { });
}

/**
 * Update the location state with mandatory safeguards:
 * 1. Ignore accuracy > 100m
 * 2. Ignore older timestamps
 * 3. Persist ONLY if newer/better
 */
export async function updateLocation(
    latitude: number,
    longitude: number,
    accuracy: number | null,
    timestamp: number
): Promise<boolean> {
    // BUG/ACCURACY GUARD: Ignore poor accuracy
    if (accuracy !== null && accuracy > 200) {
        return false;
    }

    // TIMESTAMP GUARD: Only accept newer updates
    if (currentLocation && timestamp <= currentLocation.timestamp) {
        return false;
    }

    // Update memory state
    const newLocation: LocationState = {
        latitude,
        longitude,
        accuracy,
        timestamp
    };

    currentLocation = newLocation;

    // PERSISTENCE: Save to storage (fire and forget for performance)
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newLocation)).catch(() => { });

    return true;
}

/**
 * Reset memory state
 */
export function clearLocationState(): void {
    currentLocation = null;
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => { });
}
