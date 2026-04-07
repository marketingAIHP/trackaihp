/**
 * AppStateMonitor.ts
 *
 * Monitors React Native AppState changes and logs them for debugging.
 * This helps identify when the app goes to background and if that affects location tracking.
 */

import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@AppStateMonitor:logs';
const MAX_LOGS = 50;

// Helper to add log
const addLog = async (message: string) => {
    try {
        const timestamp = new Date().toLocaleTimeString();
        const newLog = `[${timestamp}] ${message}`;

        // Get existing logs
        const existingLogsJson = await AsyncStorage.getItem(STORAGE_KEY);
        let logs = existingLogsJson ? JSON.parse(existingLogsJson) : [];

        // Add new log to start
        logs.unshift(newLog);

        // Trim
        if (logs.length > MAX_LOGS) {
            logs = logs.slice(0, MAX_LOGS);
        }

        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
    } catch (e) {
        // Ignore logging errors
    }
};

class AppStateMonitorService {
    private subscription: any = null;
    private currentState: AppStateStatus = AppState.currentState;

    /**
     * Start monitoring app state changes
     */
    start() {
        if (this.subscription) {
            return; // Already started
        }

        addLog(`📱 AppStateMonitor started. Current state: ${this.currentState}`);

        this.subscription = AppState.addEventListener('change', this.handleAppStateChange);
    }

    /**
     * Stop monitoring app state changes
     */
    stop() {
        if (this.subscription) {
            this.subscription.remove();
            this.subscription = null;
            addLog(`📱 AppStateMonitor stopped`);
        }
    }

    /**
     * Handle app state changes
     */
    private handleAppStateChange = async (nextAppState: AppStateStatus) => {
        const previousState = this.currentState;
        this.currentState = nextAppState;

        // Log the state change
        if (previousState !== nextAppState) {
            if (nextAppState === 'active') {
                await addLog(`✅ App became ACTIVE (foreground)`);
            } else if (nextAppState === 'background') {
                await addLog(`⚠️ App went to BACKGROUND`);
            } else if (nextAppState === 'inactive') {
                await addLog(`⏸️ App became INACTIVE (transitioning)`);
            }
        }
    };

    /**
     * Get all app state logs
     */
    async getLogs(): Promise<string[]> {
        try {
            const logsJson = await AsyncStorage.getItem(STORAGE_KEY);
            return logsJson ? JSON.parse(logsJson) : [];
        } catch {
            return [];
        }
    }

    /**
     * Clear all app state logs
     */
    async clearLogs(): Promise<void> {
        try {
            await AsyncStorage.removeItem(STORAGE_KEY);
        } catch {
            // Ignore
        }
    }
}

export default new AppStateMonitorService();
