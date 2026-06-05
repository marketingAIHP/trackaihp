import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { SUPABASE_ANON_KEY } from '../constants/config';
import { logger } from '../utils/logger';
import { supabase, supabaseUrlForDebug } from './supabase';

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

const IST_TIME_ZONE = 'Asia/Kolkata';
const FULL_DAY_AUTO_CHECKOUT_MS = 9 * 60 * 60 * 1000;
const ATTENDANCE_NOTIFICATION_SCOPE = 'attendance';
const AUTO_CHECKOUT_WARNING_MINUTES = 15;
const ATTENDANCE_REMINDER_MINUTES = 60;
const AUTH_STORAGE_KEY = '@auth_token';

type AppUser = { id: number; type: 'admin' | 'employee' };

function parseTimestamp(date: string | Date | null | undefined): Date {
    if (!date) return new Date(NaN);
    if (date instanceof Date) return date;

    let timestampStr = date;
    if (
        typeof timestampStr === 'string' &&
        !timestampStr.endsWith('Z') &&
        !timestampStr.includes('+') &&
        !timestampStr.includes('-', 10)
    ) {
        timestampStr = `${timestampStr}Z`;
    }

    return new Date(timestampStr);
}

function getIstDateKey(value: string | Date): string {
    const date = parseTimestamp(value);
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: IST_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);

    const year = parts.find((part) => part.type === 'year')?.value || '0000';
    const month = parts.find((part) => part.type === 'month')?.value || '00';
    const day = parts.find((part) => part.type === 'day')?.value || '00';
    return `${year}-${month}-${day}`;
}

function getNextIstMidnight(checkInTime: string | Date): Date {
    const [year, month, day] = getIstDateKey(checkInTime).split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day + 1, -5, -30, 0, 0));
}

function getAutoCheckoutDeadline(checkInTime: string | Date): Date {
    const checkInAt = parseTimestamp(checkInTime);
    const nineHourDeadline = new Date(checkInAt.getTime() + FULL_DAY_AUTO_CHECKOUT_MS);
    const dayEndDeadline = getNextIstMidnight(checkInTime);
    return new Date(Math.min(nineHourDeadline.getTime(), dayEndDeadline.getTime()));
}

async function invokeAuthenticatedNotificationFunction(functionName: string, body: Record<string, unknown>) {
    const { data: { session } } = await supabase.auth.getSession();
    const storedAccessToken = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
    const accessToken = session?.access_token || storedAccessToken;

    if (!accessToken) {
        logger.error('[NotificationService] No access token available for notification function invocation', {
            functionName,
        });
        return { success: false, error: 'No authenticated session found' };
    }

    const response = await fetch(`${supabaseUrlForDebug.replace(/\/$/, '')}/functions/v1/${functionName}`, {
        method: 'POST',
        headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    const responseText = await response.text();
    let parsedBody: any = null;

    if (responseText) {
        try {
            parsedBody = JSON.parse(responseText);
        } catch {
            parsedBody = null;
        }
    }

    if (!response.ok || parsedBody?.success === false) {
        logger.error('[NotificationService] Notification function invocation failed', {
            functionName,
            status: response.status,
            responseText,
            parsedBody,
        });
        return {
            success: false,
            error:
                parsedBody?.error ||
                parsedBody?.message ||
                responseText ||
                `Function returned HTTP ${response.status}`,
        };
    }

    logger.error('[NotificationService] Notification function invocation succeeded', {
        functionName,
        data: parsedBody?.data ?? parsedBody,
    });
    return { success: true, data: parsedBody?.data ?? parsedBody };
}

function getChannelId(data?: any): string {
    if (data?.notificationKind === 'auto_checkout_warning' || data?.type === 'alert') {
        return 'alerts';
    }

    if (data?.notificationScope === ATTENDANCE_NOTIFICATION_SCOPE) {
        return 'attendance-reminders';
    }

    return 'default';
}

async function scheduleNotificationAt(
    date: Date,
    title: string,
    body: string,
    data?: Record<string, unknown>
) {
    if (Platform.OS === 'web' || date.getTime() <= Date.now()) {
        return null;
    }

    return Notifications.scheduleNotificationAsync({
        content: {
            title,
            body,
            data: data || {},
            sound: true,
        },
        trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date,
            channelId: Platform.OS === 'android' ? getChannelId(data) : undefined,
        },
    });
}

async function cancelAttendanceNotificationSchedules() {
    if (Platform.OS === 'web') {
        return;
    }

    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const attendanceNotifications = scheduled.filter(
        (item) => item.content.data?.notificationScope === ATTENDANCE_NOTIFICATION_SCOPE
    );

    await Promise.all(
        attendanceNotifications.map((item) =>
            Notifications.cancelScheduledNotificationAsync(item.identifier).catch(() => undefined)
        )
    );
}

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

        await Notifications.setNotificationChannelAsync('attendance-reminders', {
            name: 'Attendance Reminders',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 300, 200, 300],
            lightColor: '#f59e0b',
        });
    }
}

/**
 * Trigger a local notification
 */
export async function showLocalNotification(title: string, body: string, data?: any) {
    try {
        if (Platform.OS === 'web') {
            return;
        }

        await Notifications.scheduleNotificationAsync({
            content: {
                title,
                body,
                data: data || {},
                sound: true,
            },
            trigger: Platform.OS === 'android'
                ? { channelId: getChannelId(data) }
                : null, // show immediately
        });
    } catch (error) {
        logger.warn('[NotificationService] Error showing local notification:', error);
    }
}

/**
 * Request notification permissions
 */
export async function requestNotificationPermissions(): Promise<boolean> {
    if (Platform.OS === 'web') {
        logger.error('LOG 2: Notification permission status', {
            platform: Platform.OS,
            existingStatus: 'web-unsupported',
            finalStatus: 'web-unsupported',
        });
        return false;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }

    logger.error('LOG 2: Notification permission status', {
        platform: Platform.OS,
        existingStatus,
        finalStatus,
    });

    return finalStatus === 'granted';
}

export async function registerPushToken(user: AppUser | null | undefined) {
    if (!user) return null;

    try {
        logger.error('LOG 1: Entering registerPushToken()', {
            userType: user.type,
            userId: user.id,
            platform: Platform.OS,
            isDevice: Device.isDevice,
        });

        if (Platform.OS === 'web' || !Device.isDevice) {
            logger.error('LOG 7: Registration failure', {
                platform: Platform.OS,
                isDevice: Device.isDevice,
                userType: user.type,
                userId: user.id,
                reason: 'unsupported_platform_or_simulator',
            });
            return null;
        }

        await setupNotificationChannels();

        const granted = await requestNotificationPermissions();
        if (!granted) {
            logger.error('[NotificationService] Push permission not granted', {
                userType: user.type,
                userId: user.id,
            });
            return null;
        }

        const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
        const tokenResponse = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
        const token = tokenResponse.data;

        logger.error('LOG 3: Expo token generated', {
            userType: user.type,
            userId: user.id,
            projectId,
            tokenPreview: token ? `${token.slice(0, 12)}...` : null,
        });

        logger.error('LOG 4: Calling register-push-token', {
            userType: user.type,
            userId: user.id,
            platform: Platform.OS,
        });

        const result = await invokeAuthenticatedNotificationFunction('register-push-token', {
            token,
            platform: Platform.OS,
        });

        logger.error('LOG 5: Edge function response', {
            userType: user.type,
            userId: user.id,
            success: result.success,
            response: result,
        });

        if (!result.success) {
            throw new Error(result.error || 'Failed to register push token');
        }

        logger.error('LOG 6: Registration success', {
            userType: user.type,
            userId: user.id,
            platform: Platform.OS,
        });

        return token;
    } catch (error) {
        logger.error('LOG 7: Registration failure', {
            userType: user.type,
            userId: user.id,
            error,
        });
        return null;
    }
}

export async function handleCheckInNotificationSuccess(siteName?: string, checkInTime?: string | Date | null) {
    try {
        await cancelAttendanceNotificationSchedules();

        await showLocalNotification(
            'Check-in successful',
            siteName ? `You have checked in at ${siteName}.` : 'You have checked in successfully.',
            {
                type: 'system',
                notificationScope: ATTENDANCE_NOTIFICATION_SCOPE,
                notificationKind: 'checkin_success',
            }
        );

        if (!checkInTime) {
            return;
        }

        const deadline = getAutoCheckoutDeadline(checkInTime);
        const reminderAt = new Date(deadline.getTime() - ATTENDANCE_REMINDER_MINUTES * 60 * 1000);
        const warningAt = new Date(deadline.getTime() - AUTO_CHECKOUT_WARNING_MINUTES * 60 * 1000);

        await scheduleNotificationAt(
            reminderAt,
            'Attendance reminder',
            'You are still checked in. Remember to check out before auto checkout.',
            {
                type: 'system',
                notificationScope: ATTENDANCE_NOTIFICATION_SCOPE,
                notificationKind: 'attendance_reminder',
            }
        );

        await scheduleNotificationAt(
            warningAt,
            'Auto checkout warning',
            'You will be auto checked out in 15 minutes if you do not check out manually.',
            {
                type: 'alert',
                notificationScope: ATTENDANCE_NOTIFICATION_SCOPE,
                notificationKind: 'auto_checkout_warning',
            }
        );
    } catch (error) {
        logger.warn('[NotificationService] Failed to schedule check-in notifications:', error);
    }
}

export async function handleCheckOutNotificationSuccess(siteName?: string, checkoutType?: 'manual_checkout' | 'auto_checkout') {
    try {
        await cancelAttendanceNotificationSchedules();

        const title = checkoutType === 'auto_checkout' ? 'Auto checkout completed' : 'Check-out successful';
        const body = siteName
            ? `You have checked out from ${siteName}.`
            : 'You have checked out successfully.';

        await showLocalNotification(title, body, {
            type: checkoutType === 'auto_checkout' ? 'alert' : 'system',
            notificationScope: ATTENDANCE_NOTIFICATION_SCOPE,
            notificationKind: 'checkout_success',
        });
    } catch (error) {
        logger.warn('[NotificationService] Failed to run check-out notifications:', error);
    }
}
