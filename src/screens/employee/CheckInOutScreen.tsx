import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Chip, Divider, Text, useTheme } from 'react-native-paper';
import { employeeApi } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { AttendanceSession } from '../../types';

const IST_TIME_ZONE = 'Asia/Kolkata';
const HALF_DAY_SECONDS = 4.5 * 60 * 60;

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

function sessionLabel(session?: AttendanceSession | null): string {
  if (!session) return 'No active session';
  return session.session_type === 'main_shift' ? 'Main shift' : 'Overtime';
}

function typeLabel(session: AttendanceSession): string {
  if (session.attendance_type === 'full_day') return 'Full day';
  if (session.attendance_type === 'half_day') return 'Half day';
  if (session.attendance_type === 'overtime') return 'Overtime';
  return session.status === 'checked_in' ? 'In progress' : 'Incomplete';
}

export const CheckInOutScreen: React.FC = () => {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();
  const employeeId = currentUser?.id || 0;
  const { width } = useWindowDimensions();
  const isWideWeb = Platform.OS === 'web' && width >= 768;
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const statusQuery = useQuery({
    queryKey: ['employee', 'attendance-sessions', 'status', employeeId],
    queryFn: async () => {
      const response = await employeeApi.getAttendanceStatus(employeeId);
      if (response.success && response.data) return response.data;
      throw new Error(response.error || 'Failed to load attendance status');
    },
    enabled: !!employeeId,
    refetchInterval: 30 * 1000,
  });

  const summaryQuery = useQuery({
    queryKey: ['employee', 'attendance-sessions', 'today-summary', employeeId],
    queryFn: async () => {
      const response = await employeeApi.getTodaySummary(employeeId);
      if (response.success && response.data) return response.data;
      throw new Error(response.error || 'Failed to load today summary');
    },
    enabled: !!employeeId,
    refetchInterval: 30 * 1000,
  });

  const invalidateAttendance = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['employee', 'attendance-sessions'] }),
      queryClient.invalidateQueries({ queryKey: ['employee', 'attendance'] }),
      queryClient.invalidateQueries({ queryKey: ['admin'] }),
    ]);
  };

  const checkInMutation = useMutation({
    mutationFn: async () => {
      const response = await employeeApi.checkInSession(employeeId);
      if (response.success && response.data) return response.data;
      throw new Error(response.error || 'Check-in failed');
    },
    onSuccess: async () => {
      await invalidateAttendance();
    },
    onError: (error: any) => Alert.alert('Check-in blocked', error.message || 'Check-in failed'),
  });

  const checkOutMutation = useMutation({
    mutationFn: async () => {
      const response = await employeeApi.checkOutSession(employeeId);
      if (response.success && response.data) return response.data;
      throw new Error(response.error || 'Check-out failed');
    },
    onSuccess: async () => {
      await invalidateAttendance();
    },
    onError: (error: any) => Alert.alert('Check-out blocked', error.message || 'Check-out failed'),
  });

  const activeSession = statusQuery.data?.active_session || null;
  const autoCheckoutAt = parseTime(statusQuery.data?.auto_checkout_time);
  const checkoutEnabledAt = parseTime(statusQuery.data?.checkout_enabled_at);
  const activeCheckInAt = parseTime(activeSession?.check_in_time);
  const hasActiveSession = Boolean(activeSession);

  const elapsedCurrentSessionSeconds = useMemo(() => {
    if (!activeSession || !activeCheckInAt) return 0;
    return (now - activeCheckInAt) / 1000;
  }, [activeSession, activeCheckInAt, now]);

  const remainingAutoCheckoutSeconds = useMemo(() => {
    if (!autoCheckoutAt) return 0;
    return (autoCheckoutAt - now) / 1000;
  }, [autoCheckoutAt, now]);

  const checkoutLockedSeconds = useMemo(() => {
    if (!checkoutEnabledAt) return 0;
    return (checkoutEnabledAt - now) / 1000;
  }, [checkoutEnabledAt, now]);

  const activeSessionWorkedSeconds = activeSession
    ? Math.max(0, elapsedCurrentSessionSeconds)
    : 0;
  const serverTime = parseTime(summaryQuery.data?.server_time);
  const completedWorkedSeconds = Math.max(0, summaryQuery.data?.total_worked_seconds || 0);
  const totalWorkedSeconds = completedWorkedSeconds + (activeSession && serverTime ? Math.max(0, (now - serverTime) / 1000) : 0);

  const canCheckIn = !hasActiveSession && !checkInMutation.isPending && !checkOutMutation.isPending;
  const canCheckOut =
    activeSession?.session_type === 'main_shift' &&
    activeSessionWorkedSeconds >= HALF_DAY_SECONDS &&
    !checkInMutation.isPending &&
    !checkOutMutation.isPending;

  const isLoading = statusQuery.isLoading || summaryQuery.isLoading;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={[styles.content, isWideWeb && styles.webContent]}>
          <Card style={styles.statusCard}>
            <Card.Content>
              <View style={styles.headerRow}>
                <View>
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

              {activeSession ? (
                <View style={styles.activeDetails}>
                  <Divider style={styles.divider} />
                  <Text variant="bodyMedium">Checked in: {formatIst(activeSession.check_in_time)}</Text>
                  <Text variant="bodyMedium">Auto checkout: {formatIst(statusQuery.data?.auto_checkout_time)}</Text>
                  {activeSession.session_type === 'main_shift' && !canCheckOut ? (
                    <Text variant="bodySmall" style={styles.warningText}>
                      Manual checkout unlocks in {formatDuration(checkoutLockedSeconds)}
                    </Text>
                  ) : null}
                  {activeSession.session_type === 'overtime' ? (
                    <Text variant="bodySmall" style={styles.warningText}>
                      Overtime sessions auto-check out after 2 hours or at midnight.
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </Card.Content>
          </Card>

          <View style={styles.buttonRow}>
            <Button
              mode="contained"
              icon="login"
              disabled={!canCheckIn || isLoading}
              loading={checkInMutation.isPending}
              onPress={() => checkInMutation.mutate()}
              style={styles.actionButton}>
              Check In
            </Button>
            <Button
              mode="contained-tonal"
              icon="logout"
              disabled={!canCheckOut || isLoading}
              loading={checkOutMutation.isPending}
              onPress={() => checkOutMutation.mutate()}
              style={styles.actionButton}>
              Check Out
            </Button>
          </View>

          <Card style={styles.sessionsCard}>
            <Card.Content>
              <Text variant="titleMedium" style={styles.sectionTitle}>Today Sessions</Text>
              {(summaryQuery.data?.sessions || []).length === 0 ? (
                <Text variant="bodyMedium" style={styles.emptyText}>No sessions today</Text>
              ) : (
                (summaryQuery.data?.sessions || []).map((session) => {
                  return (
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
                  );
                })
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
  title: {
    fontWeight: '700',
  },
  sectionTitle: {
    fontWeight: '700',
    marginBottom: 8,
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
    opacity: 0.75,
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
