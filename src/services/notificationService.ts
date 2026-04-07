import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';
import { logger } from '../utils/logger';

// Configure how notifications should be handled when the app is in the foreground
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
    }),
});

/**
 * Initialize notification channels (Required for Android)
 */
export async function setupNotificationChannels() {
    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
            name: 'Default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#2563eb',
        });

        await Notifications.setNotificationChannelAsync('alerts', {
            name: 'Alerts',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 500, 250, 500],
            lightColor: '#ef4444',
        });
    }
}

/**
 * Trigger a local notification
 */
export async function showLocalNotification(title: string, body: string, data?: any) {
    try {
        const channelId = data?.type === 'alert' ? 'alerts' : 'default';

        await Notifications.scheduleNotificationAsync({
            content: {
                title,
                body,
                data: data || {},
                sound: true,
            },
            trigger: null, // show immediately
        });
    } catch (error) {
        logger.warn('[NotificationService] Error showing local notification:', error);
    }
}

/**
 * Request notification permissions
 */
export async function requestNotificationPermissions(): Promise<boolean> {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }

    return finalStatus === 'granted';
}

export async function registerPushToken(user: { id: number; type: 'admin' | 'employee' } | null | undefined) {
    if (!user) return null;

    try {
        const granted = await requestNotificationPermissions();
        if (!granted) return null;

        const projectId = Constants.expoConfig?.extra?.eas?.projectId;
        const tokenResponse = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
        const token = tokenResponse.data;

        await supabase
            .from('notification_tokens')
            .upsert({
                token,
                platform: Platform.OS,
                admin_id: user.type === 'admin' ? user.id : null,
                employee_id: user.type === 'employee' ? user.id : null,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'token' });

        return token;
    } catch (error) {
        logger.warn('[NotificationService] Failed to register push token:', error);
        return null;
    }
}
