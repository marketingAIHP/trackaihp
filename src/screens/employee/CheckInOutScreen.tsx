import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Chip, Divider, Text, useTheme } from 'react-native-paper';
import { employeeApi } from '../../services/api';
import { ATTENDANCE_GPS_ACCURACY_THRESHOLD } from '../../constants/config';
import { useAuth } from '../../hooks/useAuth';
import { useLocation } from '../../hooks/useLocation';
import {
  Attendance,
  AttendanceSession,
  AttendanceType,
  LocationSnapshot,
  NearbyWorkSiteMatch,
} from '../../types';
import {
  findNearestSiteWithinGeofence,
  isGpsAccurateEnough,
} from '../../utils/geofence';
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
    getCurrentLocationSnapshot,
    refreshLocation: refreshCachedLocation,
    primeLocation,
  } = useLocation();

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    void primeLocation();
  }, [primeLocation]);

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

  const profile = profileQuery.data;

  const workSitesQuery = useQuery({
    queryKey: ['employee', 'work-sites', profile?.admin_id],
    queryFn: async () => {
      const response = await employeeApi.getAvailableWorkSites(profile!.admin_id);
      if (response.success && response.data) return response.data;
      throw new Error(response.error || 'Failed to load work sites');
    },
    enabled: !!profile?.admin_id && !profile?.remote_work,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
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

  const invalidateAttendance = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['employee', 'attendance'] }),
      queryClient.invalidateQueries({ queryKey: ['employee', 'attendance-sessions'] }),
      queryClient.invalidateQueries({ queryKey: ['admin'] }),
    ]);
  }, [queryClient]);

  const currentAttendance = currentAttendanceQuery.data || null;
  const availableWorkSites = workSitesQuery.data || [];
  const hasNearbyWorkSite = !profile?.remote_work && availableWorkSites.length > 0;

  const nearbySite = useMemo<NearbyWorkSiteMatch | null>(() => {
    if (!coordinates || profile?.remote_work || availableWorkSites.length === 0) {
      return null;
    }

    return findNearestSiteWithinGeofence(coordinates, availableWorkSites);
  }, [availableWorkSites, coordinates, profile?.remote_work]);

  const isGpsAccurate = isGpsAccurateEnough(accuracy);
  const locationSummary = useMemo(() => {
    if (profile?.remote_work) {
      if (currentAttendance?.check_in_location_name) {
        return currentAttendance.check_in_location_name;
      }
      return 'Remote location will be captured at check-in';
    }

    if (workSitesQuery.isLoading) {
      return 'Loading nearby work sites...';
    }

    if (currentAttendance?.site?.name) {
      return currentAttendance.site.name;
    }

    if (nearbySite) {
      return nearbySite.site.name;
    }

    return hasNearbyWorkSite ? 'No nearby work site detected' : 'No active work sites available';
  }, [
    currentAttendance?.check_in_location_name,
    currentAttendance?.site?.name,
    hasNearbyWorkSite,
    nearbySite,
    profile?.remote_work,
    workSitesQuery.isLoading,
  ]);

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
    !currentAttendanceQuery.isLoading && !profileQuery.isLoading &&
    (profile?.remote_work || !workSitesQuery.isLoading);
  const canCheckOut = (() => {
    if (!employeeId || !hasActiveSession || !activeSession || isProcessingAttendance) return false;
    if (activeSession.session_type === 'overtime') return true;
    return activeSessionWorkedSeconds >= HALF_DAY_SECONDS;
  })();

  useEffect(() => {
    if (!employeeId || !hasActiveSession || !autoCheckoutAt) return;

    const refreshDelayMs = Math.max(0, autoCheckoutAt - Date.now()) + 500;
    const timeoutId = setTimeout(() => {
      invalidateAttendance().catch(() => {});
    }, refreshDelayMs);

    return () => clearTimeout(timeoutId);
  }, [autoCheckoutAt, currentAttendance?.id, employeeId, hasActiveSession, invalidateAttendance]);

  useEffect(() => {
    if (!employeeId || currentAttendanceQuery.isLoading || currentAttendance) return;

    LocationTrackingService.checkOutEmployee().catch(() => {});
  }, [currentAttendance, currentAttendanceQuery.isLoading, employeeId]);

  const refreshLocation = useCallback(async () => {
    setIsRefreshingLocation(true);
    try {
      await refreshCachedLocation({
        targetAccuracy: ATTENDANCE_GPS_ACCURACY_THRESHOLD,
        timeoutMs: 5000,
        retryCount: 1,
        allowStaleFallback: false,
      });
    } finally {
      setIsRefreshingLocation(false);
    }
  }, [refreshCachedLocation]);

  const getDetectedSiteForSnapshot = useCallback((snapshot: LocationSnapshot) => {
    if (profile?.remote_work) {
      return null;
    }

    return findNearestSiteWithinGeofence(snapshot.coordinates, availableWorkSites);
  }, [availableWorkSites, profile?.remote_work]);

  const getFreshLocationForAttendance = useCallback(async (
    actionLabel: 'check in' | 'check out'
  ): Promise<{ snapshot: LocationSnapshot; detectedSite: NearbyWorkSiteMatch | null } | null> => {
    const snapshot = await getCurrentLocationSnapshot({
      preferCached: true,
      targetAccuracy: ATTENDANCE_GPS_ACCURACY_THRESHOLD,
      maxAgeMs: 20000,
      timeoutMs: 4500,
      retryCount: 1,
      allowStaleFallback: true,
    });

    if (!snapshot) {
      Alert.alert(
        'Location not available',
        locationError || 'Please enable location services and try again.'
      );
      return null;
    }

    if (!isGpsAccurateEnough(snapshot.accuracy)) {
      Alert.alert(
        'GPS accuracy too low',
        `A GPS accuracy of ${ATTENDANCE_GPS_ACCURACY_THRESHOLD}m or better is required to ${actionLabel}. Current accuracy: ${Math.round(snapshot.accuracy || 0)}m.`
      );
      return null;
    }

    if (profile?.remote_work) {
      return { snapshot, detectedSite: null };
    }

    if (workSitesQuery.isLoading) {
      Alert.alert('Loading sites', 'Please wait while nearby work sites are loaded.');
      return null;
    }

    if (availableWorkSites.length === 0) {
      Alert.alert('No active work sites', 'No active work sites are available right now.');
      return null;
    }

    const detectedSite = getDetectedSiteForSnapshot(snapshot);
    if (!detectedSite) {
      Alert.alert(
        'No nearby work site',
        `You must be inside an active work site radius to ${actionLabel}.`
      );
      return null;
    }

    return { snapshot, detectedSite };
  }, [
    availableWorkSites,
    getCurrentLocationSnapshot,
    getDetectedSiteForSnapshot,
    locationError,
    profile?.remote_work,
    workSitesQuery.isLoading,
  ]);

  const checkInMutation = useMutation({
    mutationFn: async (payload: { snapshot: LocationSnapshot; detectedSite: NearbyWorkSiteMatch | null }) => {
      const siteId = profile?.remote_work
        ? (profile?.site_id || null)
        : (payload.detectedSite?.site.id || null);
      const response = await employeeApi.checkIn(employeeId, siteId, {
        latitude: payload.snapshot.coordinates.latitude,
        longitude: payload.snapshot.coordinates.longitude,
        accuracy: payload.snapshot.accuracy,
      });
      if (response.success && response.data) return response.data;
      throw new Error(response.error || 'Check-in failed');
    },
    onSuccess: async (attendance, payload) => {
      const siteId = attendance.site_id || profile?.site_id || undefined;
      const trackingResult = await LocationTrackingService.checkInEmployee(
        employeeId,
        siteId,
        {
          latitude: attendance.check_in_latitude ?? payload.snapshot.coordinates.latitude,
          longitude: attendance.check_in_longitude ?? payload.snapshot.coordinates.longitude,
        }
      );
      if (!trackingResult.success) {
        Alert.alert('Tracking Error', trackingResult.error || 'Failed to start live tracking');
      }

      await invalidateAttendance();
      Alert.alert(
        'Success',
        `Checked in successfully at ${attendance.site?.name || attendance.check_in_location_name || 'Remote Work'}.`
      );
    },
    onError: (error: any) => {
      Alert.alert('Check-in blocked', error.message || 'Check-in failed');
    },
  });

  const checkOutMutation = useMutation({
    mutationFn: async (payload: { snapshot: LocationSnapshot; detectedSite: NearbyWorkSiteMatch | null }) => {
      if (!currentAttendance) {
        throw new Error('No active attendance');
      }

      const response = await employeeApi.checkOut(employeeId, currentAttendance.id, {
        latitude: payload.snapshot.coordinates.latitude,
        longitude: payload.snapshot.coordinates.longitude,
        accuracy: payload.snapshot.accuracy,
      });
      if (response.success && response.data) return response.data;
      throw new Error(response.error || 'Check-out failed');
    },
    onSuccess: async (attendance) => {
      await LocationTrackingService.checkOutEmployee();
      await invalidateAttendance();
      Alert.alert(
        'Success',
        `Checked out successfully from ${attendance.site?.name || attendance.check_out_location_name || 'Remote Work'}.`
      );
    },
    onError: (error: any) => {
      Alert.alert('Check-out blocked', error.message || 'Check-out failed');
    },
  });

  const handleCheckIn = useCallback(async () => {
    if (!canCheckIn || checkInMutation.isPending || checkOutMutation.isPending) return;

    setIsProcessingAttendance(true);
    try {
      const attendancePayload = await getFreshLocationForAttendance('check in');
      if (!attendancePayload) return;

      await checkInMutation.mutateAsync(attendancePayload);
    } finally {
      setIsProcessingAttendance(false);
    }
  }, [
    canCheckIn,
    checkInMutation,
    checkOutMutation.isPending,
    getFreshLocationForAttendance,
  ]);

  const handleCheckOut = useCallback(async () => {
    if (!canCheckOut || checkInMutation.isPending || checkOutMutation.isPending) return;

    setIsProcessingAttendance(true);
    try {
      const attendancePayload = await getFreshLocationForAttendance('check out');
      if (!attendancePayload) return;

      await checkOutMutation.mutateAsync(attendancePayload);
    } finally {
      setIsProcessingAttendance(false);
    }
  }, [
    canCheckOut,
    checkInMutation.isPending,
    checkOutMutation,
    getFreshLocationForAttendance,
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
                <View style={styles.locationHeaderContent}>
                  <Text variant="titleMedium" style={styles.sectionTitle}>Current Location</Text>
                  <Text variant="bodySmall" style={styles.muted}>
                    Cached GPS stays warm while the app is open for faster attendance.
                  </Text>
                </View>
                <Button
                  mode="outlined"
                  compact
                  icon="refresh"
                  loading={isRefreshingLocation}
                  onPress={refreshLocation}
                  style={styles.refreshButton}>
                  Refresh
                </Button>
              </View>

              {coordinates ? (
                <View style={styles.locationDetails}>
                  <Text variant="bodyMedium">
                    {profile?.remote_work ? 'Location' : 'Detected site'}: {locationSummary}
                  </Text>
                  {!profile?.remote_work && nearbySite ? (
                    <Text variant="bodySmall" style={styles.muted}>
                      Distance: {formatDistance(nearbySite.distance)} | Radius: {formatDistance(nearbySite.geofenceRadius)}
                    </Text>
                  ) : null}
                  {accuracy !== null ? (
                    <Text variant="bodySmall" style={styles.muted}>GPS accuracy: {Math.round(accuracy)}m</Text>
                  ) : null}
                </View>
              ) : (
                <Text variant="bodyMedium" style={styles.emptyText}>
                  {locationLoading ? 'Warming up GPS cache...' : 'Waiting for cached location...'}
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
              {coordinates && !isGpsAccurate ? (
                <Text variant="bodySmall" style={styles.warningText}>
                  GPS accuracy must be {ATTENDANCE_GPS_ACCURACY_THRESHOLD}m or better before attendance actions are allowed.
                </Text>
              ) : null}
              {!profile?.remote_work && !workSitesQuery.isLoading && !nearbySite && hasNearbyWorkSite ? (
                <Text variant="bodySmall" style={styles.warningText}>
                  Move inside a nearby active work site radius to check in or check out.
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
              {isProcessingAttendance && !hasActiveSession ? 'Checking In...' : 'Check In'}
            </Button>
            <Button
              mode="contained-tonal"
              icon="logout"
              disabled={!canCheckOut}
              loading={isProcessingAttendance && hasActiveSession}
              onPress={handleCheckOut}
              style={styles.actionButton}>
              {isProcessingAttendance && hasActiveSession ? 'Checking Out...' : 'Check Out'}
            </Button>
          </View>

          {!profile?.remote_work && workSitesQuery.error ? (
            <Text variant="bodySmall" style={styles.warningText}>
              {(workSitesQuery.error as Error).message}
            </Text>
          ) : null}

          {!profile?.remote_work && !workSitesQuery.isLoading && availableWorkSites.length === 0 && !workSitesQuery.error ? (
            <Text variant="bodySmall" style={styles.warningText}>
              No active work sites found. Please contact your administrator.
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  locationHeaderContent: {
    flex: 1,
    minWidth: 0,
  },
  refreshButton: {
    alignSelf: 'flex-start',
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
