import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Chip, Divider, Text, useTheme } from 'react-native-paper';
import { employeeApi } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { useLocation } from '../../hooks/useLocation';
import { Attendance, AttendanceSession, AttendanceType, Coordinates } from '../../types';
import { checkGeofence } from '../../utils/geofence';
import { formatDistance } from '../../utils/format';
import LocationTrackingService from '../../services/LocationTrackingService';

const IST_TIME_ZONE = 'Asia/Kolkata';
const HALF_DAY_SECONDS = 4.5 * 60 * 60;
const FULL_DAY_SECONDS = 9 * 60 * 60;
const OVERTIME_SECONDS = 2 * 60 * 60;

function parseTime(value?: string | null): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function formatDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
}

function formatIst(value?: string | null): string {
  if (!value) return '--';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(value));
}

function istDateKey(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
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

function getIstParts(value: string | Date): { year: number; month: number; day: number } {
  const [year, month, day] = istDateKey(value).split('-').map(Number);
  return { year, month, day };
}

function nextIstMidnightMs(value: string | Date): number {
  const { year, month, day } = getIstParts(value);
  return Date.UTC(year, month - 1, day + 1, -5, -30, 0, 0);
}

function isTodayIst(value?: string | null): boolean {
  if (!value) return false;
  return istDateKey(value) === istDateKey(new Date());
}

function sessionLabel(session?: AttendanceSession | null): string {
  if (!session) return 'Not checked in';
  return session.session_type === 'main_shift' ? 'Main shift' : 'Overtime';
}

function inferAttendanceType(
  sessionType: AttendanceSession['session_type'],
  workedSeconds: number
): AttendanceType | null {
  if (sessionType === 'overtime') return 'overtime';
  if (workedSeconds >= FULL_DAY_SECONDS) return 'full_day';
  if (workedSeconds >= HALF_DAY_SECONDS) return 'half_day';
  return null;
}

function typeLabel(session: AttendanceSession): string {
  if (session.attendance_type === 'full_day') return 'Full day';
  if (session.attendance_type === 'half_day') return 'Half day';
  if (session.attendance_type === 'overtime') return 'Overtime';
  return session.status === 'checked_in' ? 'In progress' : 'Incomplete';
}

function autoCheckoutDeadlineMs(session: AttendanceSession): number | null {
  const checkInAt = parseTime(session.check_in_time);
  if (!checkInAt) return null;
  const durationMs =
    (session.session_type === 'main_shift' ? FULL_DAY_SECONDS : OVERTIME_SECONDS) * 1000;
  return Math.min(checkInAt + durationMs, nextIstMidnightMs(session.check_in_time));
}

function attendanceToSession(attendance: Attendance, index: number): AttendanceSession {
  const sessionType: AttendanceSession['session_type'] =
    index === 0 ? 'main_shift' : 'overtime';
  const checkInAt = parseTime(attendance.check_in_time) || 0;
  const checkOutAt = parseTime(attendance.check_out_time || null);
  const workedSeconds = checkOutAt ? Math.max(0, (checkOutAt - checkInAt) / 1000) : 0;

  return {
    id: attendance.id,
    employee_id: attendance.employee_id,
    session_type: sessionType,
    check_in_time: attendance.check_in_time,
    check_out_time: attendance.check_out_time || null,
    status: attendance.check_out_time
      ? attendance.checkout_type === 'auto_checkout'
        ? 'auto_checked_out'
        : 'checked_out'
      : 'checked_in',
    attendance_type: attendance.check_out_time
      ? inferAttendanceType(sessionType, workedSeconds)
      : null,
    created_at: attendance.check_in_time,
  };
}

function buildTodaySessions(
  history: Attendance[] | undefined,
  currentAttendance: Attendance | null | undefined
): AttendanceSession[] {
  const byId = new Map<number, Attendance>();

  (history || []).forEach((attendance) => {
    if (isTodayIst(attendance.check_in_time)) {
      byId.set(attendance.id, attendance);
    }
  });

  if (currentAttendance && isTodayIst(currentAttendance.check_in_time)) {
    byId.set(currentAttendance.id, currentAttendance);
  }

  return Array.from(byId.values())
    .sort((a, b) => (parseTime(a.check_in_time) || 0) - (parseTime(b.check_in_time) || 0))
    .map(attendanceToSession);
}

export const CheckInOutScreen: React.FC = () => {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();
  const employeeId = currentUser?.id || 0;
  const { width } = useWindowDimensions();
  const isWideWeb = Platform.OS === 'web' && width >= 768;
  const [now, setNow] = useState(Date.now());
  const [isRefreshingLocation, setIsRefreshingLocation] = useState(false);
  const [isProcessingAttendance, setIsProcessingAttendance] = useState(false);

  const {
    coordinates,
    loading: locationLoading,
    accuracy,
    error: locationError,
    permissionGranted,
    getCurrentLocation,
  } = useLocation();

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const profileQuery = useQuery({
    queryKey: ['employee', 'profile', employeeId],
    queryFn: async () => {
      const response = await employeeApi.getProfile(employeeId);
      if (response.success && response.data) return response.data;
      throw new Error(response.error || 'Failed to load profile');
    },
    enabled: !!employeeId,
    staleTime: 5 * 60 * 1000,
  });

  const currentAttendanceQuery = useQuery({
    queryKey: ['employee', 'attendance', 'current', employeeId],
    queryFn: async () => {
      const response = await employeeApi.getCurrentAttendance(employeeId);
      if (response.success) return response.data;
      throw new Error(response.error || 'Failed to load attendance');
    },
    enabled: !!employeeId,
    refetchOnMount: 'always',
    staleTime: 0,
  });

  const historyQuery = useQuery({
    queryKey: ['employee', 'attendance', 'history', employeeId],
    queryFn: async () => {
      const response = await employeeApi.getAttendanceHistory(employeeId);
      if (response.success && response.data) return response.data;
      throw new Error(response.error || 'Failed to load attendance history');
    },
    enabled: !!employeeId && currentAttendanceQuery.data !== undefined,
    refetchInterval: 60 * 1000,
    staleTime: 30 * 1000,
  });

  const invalidateAttendance = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['employee', 'attendance'] }),
      queryClient.invalidateQueries({ queryKey: ['employee', 'attendance-sessions'] }),
      queryClient.invalidateQueries({ queryKey: ['admin'] }),
    ]);
  };

  const profile = profileQuery.data;
  const currentAttendance = currentAttendanceQuery.data || null;
  const assignedSite = profile?.site;

  const todaySessions = useMemo(
    () => buildTodaySessions(historyQuery.data, currentAttendance),
    [historyQuery.data, currentAttendance]
  );

  const activeSession =
    todaySessions.find((session) => session.status === 'checked_in') ||
    (currentAttendance ? attendanceToSession(currentAttendance, 0) : null);
  const hasActiveSession = Boolean(currentAttendance);
  const autoCheckoutAt = activeSession ? autoCheckoutDeadlineMs(activeSession) : null;
  const activeCheckInAt = parseTime(activeSession?.check_in_time);
  const checkoutEnabledAt =
    activeSession?.session_type === 'main_shift' && activeCheckInAt
      ? activeCheckInAt + HALF_DAY_SECONDS * 1000
      : null;

  const activeSessionWorkedSeconds = activeSession && activeCheckInAt
    ? Math.max(0, (now - activeCheckInAt) / 1000)
    : 0;
  const completedWorkedSeconds = todaySessions.reduce((total, session) => {
    if (!session.check_out_time) return total;
    const checkInAt = parseTime(session.check_in_time);
    const checkOutAt = parseTime(session.check_out_time);
    if (!checkInAt || !checkOutAt) return total;
    return total + Math.max(0, (checkOutAt - checkInAt) / 1000);
  }, 0);
  const totalWorkedSeconds = completedWorkedSeconds + activeSessionWorkedSeconds;

  const remainingAutoCheckoutSeconds = autoCheckoutAt
    ? (autoCheckoutAt - now) / 1000
    : 0;
  const checkoutLockedSeconds = checkoutEnabledAt
    ? (checkoutEnabledAt - now) / 1000
    : 0;

  const canCheckIn =
    !!employeeId && !hasActiveSession && !isProcessingAttendance &&
    !currentAttendanceQuery.isLoading && !profileQuery.isLoading;
  const canCheckOut = (() => {
    if (!employeeId || !hasActiveSession || !activeSession || isProcessingAttendance) return false;
    if (activeSession.session_type === 'overtime') return true;
    return activeSessionWorkedSeconds >= HALF_DAY_SECONDS;
  })();

  const refreshLocation = useCallback(async () => {
    setIsRefreshingLocation(true);
    try {
      await getCurrentLocation({
        preferCached: false,
        targetAccuracy: 20,
        timeoutMs: 15000,
      });
    } finally {
      setIsRefreshingLocation(false);
    }
  }, [getCurrentLocation]);

  const getFreshLocationForAttendance = useCallback(async (): Promise<Coordinates | null> => {
    const freshLocation = await getCurrentLocation({
      preferCached: false,
      targetAccuracy: 20,
      timeoutMs: 15000,
    });

    if (!freshLocation) {
      Alert.alert(
        'Location not available',
        locationError || 'Please enable location services and try again.'
      );
      return null;
    }

    return freshLocation;
  }, [getCurrentLocation, locationError]);

  const validateLocationForAction = useCallback((
    freshLocation: Coordinates,
    actionLabel: 'check in' | 'check out'
  ): boolean => {
    if (profile?.remote_work) return true;

    if (!assignedSite) {
      Alert.alert('No assigned site', 'Please contact your administrator to assign a work site.');
      return false;
    }

    const geofenceStatus = checkGeofence(freshLocation, assignedSite);
    if (!geofenceStatus.isWithinGeofence) {
      Alert.alert(
        'Outside assigned site',
        `You must be within the assigned site radius to ${actionLabel}. Current distance: ${formatDistance(geofenceStatus.distance)}. Allowed radius: ${formatDistance(geofenceStatus.geofenceRadius)}.`
      );
      return false;
    }

    return true;
  }, [assignedSite, profile?.remote_work]);

  const checkInMutation = useMutation({
    mutationFn: async (location: Coordinates) => {
      if (!profile?.remote_work && !profile?.site_id) {
        throw new Error('No assigned work site. Please contact administrator.');
      }

      const siteId = profile?.remote_work ? (profile?.site_id || null) : profile.site_id!;
      const response = await employeeApi.checkIn(employeeId, siteId, location);
      if (response.success && response.data) return response.data;
      throw new Error(response.error || 'Check-in failed');
    },
    onSuccess: async (attendance, checkInLocation) => {
      const siteId = attendance.site_id || profile?.site_id || undefined;
      const trackingResult = await LocationTrackingService.checkInEmployee(
        employeeId,
        siteId,
        {
          latitude: attendance.check_in_latitude ?? checkInLocation.latitude,
          longitude: attendance.check_in_longitude ?? checkInLocation.longitude,
        }
      );
      if (!trackingResult.success) {
        Alert.alert('Tracking Error', trackingResult.error || 'Failed to start live tracking');
      }

      await invalidateAttendance();
      Alert.alert('Success', 'Checked in successfully. Location tracking is active.');
    },
    onError: (error: any) => {
      Alert.alert('Check-in blocked', error.message || 'Check-in failed');
    },
  });

  const checkOutMutation = useMutation({
    mutationFn: async (location: Coordinates) => {
      if (!currentAttendance) {
        throw new Error('No active attendance');
      }

      const response = await employeeApi.checkOut(employeeId, currentAttendance.id, location);
      if (response.success && response.data) return response.data;
      throw new Error(response.error || 'Check-out failed');
    },
    onSuccess: async () => {
      await LocationTrackingService.checkOutEmployee();
      await invalidateAttendance();
      Alert.alert('Success', 'Checked out successfully. Location tracking stopped.');
    },
    onError: (error: any) => {
      Alert.alert('Check-out blocked', error.message || 'Check-out failed');
    },
  });

  const handleCheckIn = useCallback(async () => {
    if (!canCheckIn || checkInMutation.isPending || checkOutMutation.isPending) return;

    setIsProcessingAttendance(true);
    try {
      const freshLocation = await getFreshLocationForAttendance();
      if (!freshLocation || !validateLocationForAction(freshLocation, 'check in')) return;

      await checkInMutation.mutateAsync(freshLocation);
    } finally {
      setIsProcessingAttendance(false);
    }
  }, [
    canCheckIn,
    checkInMutation,
    checkOutMutation.isPending,
    getFreshLocationForAttendance,
    validateLocationForAction,
  ]);

  const handleCheckOut = useCallback(async () => {
    if (!canCheckOut || checkInMutation.isPending || checkOutMutation.isPending) return;

    setIsProcessingAttendance(true);
    try {
      const freshLocation = await getFreshLocationForAttendance();
      if (!freshLocation || !validateLocationForAction(freshLocation, 'check out')) return;

      await checkOutMutation.mutateAsync(freshLocation);
    } finally {
      setIsProcessingAttendance(false);
    }
  }, [
    canCheckOut,
    checkInMutation.isPending,
    checkOutMutation,
    getFreshLocationForAttendance,
    validateLocationForAction,
  ]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={[styles.content, isWideWeb && styles.webContent]}>
          <Card style={styles.statusCard}>
            <Card.Content>
              <View style={styles.headerRow}>
                <View style={styles.headerTitle}>
                  <Text variant="titleLarge" style={styles.title}>Attendance</Text>
                  <Text variant="bodyMedium" style={styles.muted}>IST day ends at 12:00 AM</Text>
                </View>
                <Chip icon={hasActiveSession ? 'timer-sand' : 'check-circle-outline'}>
                  {sessionLabel(activeSession)}
                </Chip>
              </View>

              <View style={styles.metricGrid}>
                <View style={styles.metric}>
                  <Icon name="clock-check-outline" size={24} color={theme.colors.primary} />
                  <Text variant="labelMedium" style={styles.muted}>Total today</Text>
                  <Text variant="headlineSmall" style={styles.metricValue}>
                    {formatDuration(totalWorkedSeconds)}
                  </Text>
                </View>
                <View style={styles.metric}>
                  <Icon name="timer-outline" size={24} color={theme.colors.primary} />
                  <Text variant="labelMedium" style={styles.muted}>Current session</Text>
                  <Text variant="headlineSmall" style={styles.metricValue}>
                    {formatDuration(activeSessionWorkedSeconds)}
                  </Text>
                </View>
                <View style={styles.metric}>
                  <Icon name="timer-sand" size={24} color={theme.colors.primary} />
                  <Text variant="labelMedium" style={styles.muted}>Auto checkout in</Text>
                  <Text variant="headlineSmall" style={styles.metricValue}>
                    {hasActiveSession ? formatDuration(remainingAutoCheckoutSeconds) : '--:--:--'}
                  </Text>
                </View>
              </View>

              <View style={styles.activeDetails}>
                <Divider style={styles.divider} />
                <Text variant="bodyMedium">Checked in: {formatIst(activeSession?.check_in_time)}</Text>
                <Text variant="bodyMedium">
                  Auto checkout: {autoCheckoutAt ? formatIst(new Date(autoCheckoutAt).toISOString()) : '--'}
                </Text>
                {activeSession?.session_type === 'main_shift' && !canCheckOut ? (
                  <Text variant="bodySmall" style={styles.warningText}>
                    Manual checkout unlocks in {formatDuration(checkoutLockedSeconds)}
                  </Text>
                ) : null}
                {activeSession?.session_type === 'overtime' ? (
                  <Text variant="bodySmall" style={styles.warningText}>
                    Overtime sessions auto-check out after 2 hours or at midnight.
                  </Text>
                ) : null}
              </View>
            </Card.Content>
          </Card>

          <Card style={styles.locationCard}>
            <Card.Content>
              <View style={styles.locationHeader}>
                <View>
                  <Text variant="titleMedium" style={styles.sectionTitle}>Current Location</Text>
                  <Text variant="bodySmall" style={styles.muted}>
                    Fresh GPS is fetched again when you check in or out.
                  </Text>
                </View>
                <Button
                  mode="outlined"
                  compact
                  icon="refresh"
                  loading={isRefreshingLocation}
                  onPress={refreshLocation}>
                  Refresh
                </Button>
              </View>

              {coordinates ? (
                <View style={styles.locationDetails}>
                  <Text variant="bodyMedium">Latitude: {coordinates.latitude.toFixed(6)}</Text>
                  <Text variant="bodyMedium">Longitude: {coordinates.longitude.toFixed(6)}</Text>
                  {accuracy !== null ? (
                    <Text variant="bodySmall" style={styles.muted}>GPS accuracy: {Math.round(accuracy)}m</Text>
                  ) : null}
                </View>
              ) : (
                <Text variant="bodyMedium" style={styles.emptyText}>
                  {locationLoading ? 'Fetching location...' : 'Location not fetched yet'}
                </Text>
              )}

              {locationError ? (
                <Text variant="bodySmall" style={styles.warningText}>{locationError}</Text>
              ) : null}
              {permissionGranted === false ? (
                <Text variant="bodySmall" style={styles.warningText}>
                  Location permission is required for check-in and check-out.
                </Text>
              ) : null}
            </Card.Content>
          </Card>

          <View style={styles.buttonRow}>
            <Button
              mode="contained"
              icon="login"
              disabled={!canCheckIn}
              loading={isProcessingAttendance && !hasActiveSession}
              onPress={handleCheckIn}
              style={styles.actionButton}>
              {isProcessingAttendance && !hasActiveSession ? 'Getting Location...' : 'Check In'}
            </Button>
            <Button
              mode="contained-tonal"
              icon="logout"
              disabled={!canCheckOut}
              loading={isProcessingAttendance && hasActiveSession}
              onPress={handleCheckOut}
              style={styles.actionButton}>
              {isProcessingAttendance && hasActiveSession ? 'Getting Location...' : 'Check Out'}
            </Button>
          </View>

          {!profile?.remote_work && !assignedSite && !profileQuery.isLoading ? (
            <Text variant="bodySmall" style={styles.warningText}>
              No assigned work site found. Please contact your administrator.
            </Text>
          ) : null}

          <Card style={styles.sessionsCard}>
            <Card.Content>
              <Text variant="titleMedium" style={styles.sectionTitle}>Today Sessions</Text>
              {todaySessions.length === 0 ? (
                <Text variant="bodyMedium" style={styles.emptyText}>No sessions today</Text>
              ) : (
                todaySessions.map((session) => (
                  <View key={session.id} style={styles.sessionRow}>
                    <View style={styles.sessionIcon}>
                      <Icon
                        name={session.session_type === 'main_shift' ? 'briefcase-clock-outline' : 'clock-plus-outline'}
                        size={22}
                        color={theme.colors.primary}
                      />
                    </View>
                    <View style={styles.sessionBody}>
                      <Text variant="titleSmall">{sessionLabel(session)}</Text>
                      <Text variant="bodySmall" style={styles.muted}>
                        {formatIst(session.check_in_time)} - {session.check_out_time ? formatIst(session.check_out_time) : 'Active'}
                      </Text>
                    </View>
                    <Chip compact>{session.status === 'auto_checked_out' ? 'Auto' : typeLabel(session)}</Chip>
                  </View>
                ))
              )}
            </Card.Content>
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  webContent: {
    width: '100%',
    maxWidth: 1080,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  statusCard: {
    borderRadius: 8,
  },
  locationCard: {
    borderRadius: 8,
  },
  sessionsCard: {
    borderRadius: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
  },
  headerTitle: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontWeight: '700',
  },
  sectionTitle: {
    fontWeight: '700',
    marginBottom: 4,
  },
  muted: {
    opacity: 0.7,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metric: {
    flexGrow: 1,
    flexBasis: 220,
    minHeight: 116,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(120,120,120,0.35)',
    padding: 14,
    justifyContent: 'space-between',
  },
  metricValue: {
    fontWeight: '700',
  },
  activeDetails: {
    marginTop: 4,
    gap: 6,
  },
  divider: {
    marginVertical: 12,
  },
  warningText: {
    marginTop: 4,
    opacity: 0.8,
  },
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  locationDetails: {
    gap: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    borderRadius: 8,
  },
  emptyText: {
    paddingVertical: 12,
    opacity: 0.7,
  },
  sessionRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(120,120,120,0.25)',
  },
  sessionIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(80,120,160,0.12)',
  },
  sessionBody: {
    flex: 1,
    minWidth: 0,
  },
});
