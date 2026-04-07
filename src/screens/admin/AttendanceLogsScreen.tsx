import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Chip, Menu, Searchbar, Text, useTheme } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { adminApi } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { AttendanceReportFilters, AttendanceReportRecord, AttendanceStatusFilter } from '../../types';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { formatDate, formatDuration, formatTime, parseTimestamp } from '../../utils/format';
import { colors } from '../../theme/colors';

const statusOptions: AttendanceStatusFilter[] = ['all', 'on_site', 'checked_out', 'remote_work'];
function formatOptionLabel(value: string) {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export const AttendanceLogsScreen: React.FC = () => {
  const theme = useTheme();
  const { currentUser } = useAuth();
  const adminId = currentUser?.id || 0;
  const [attendanceStatus, setAttendanceStatus] = useState<AttendanceStatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusMenuVisible, setStatusMenuVisible] = useState(false);
  const [employeeMenuVisible, setEmployeeMenuVisible] = useState(false);
  const [siteMenuVisible, setSiteMenuVisible] = useState(false);
  const [employeeId, setEmployeeId] = useState<number | undefined>();
  const [siteId, setSiteId] = useState<number | undefined>();

  const filters = useMemo<AttendanceReportFilters>(() => {
    const now = new Date();
    const monthAgo = new Date(now);
    monthAgo.setDate(now.getDate() - 30);

    return {
      dateFrom: monthAgo.toISOString(),
      dateTo: now.toISOString(),
      period: 'monthly' as const,
      attendanceStatus,
      employeeId,
      siteId,
    };
  }, [attendanceStatus, employeeId, siteId]);

  const { data: employees } = useQuery({
    queryKey: ['admin', 'employees', adminId],
    queryFn: async () => {
      const response = await adminApi.getEmployees(adminId);
      return response.success ? response.data || [] : [];
    },
    enabled: !!adminId,
    staleTime: 300000,
  });

  const { data: sites } = useQuery({
    queryKey: ['admin', 'sites', adminId],
    queryFn: async () => {
      const response = await adminApi.getSites(adminId);
      return response.success ? response.data || [] : [];
    },
    enabled: !!adminId,
    staleTime: 300000,
  });

  const { data, isLoading, refetch, isRefetching, error } = useQuery({
    queryKey: ['admin', 'attendance-logs', adminId, filters],
    queryFn: async () => {
      const response = await adminApi.getAttendanceReport(adminId, filters);
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.error || 'Failed to load attendance logs');
    },
    enabled: !!adminId,
  });

  const logs = data || [];

  const filteredLogs = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return logs;
    }

    return logs.filter((log) => {
      const haystack = [
        log.employee_name,
        log.site_name,
        log.check_in_location,
        log.check_out_location,
        log.attendance_status,
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [logs, searchQuery]);

  const summary = useMemo(() => {
    const checkedOut = logs.filter((log) => log.attendance_status === 'checked_out').length;
    const onSite = logs.filter((log) => log.attendance_status === 'on_site').length;
    const remote = logs.filter((log) => log.attendance_status === 'remote_work').length;
    const autoCheckout = logs.filter((log) => log.checkout_type === 'auto_checkout').length;

    return {
      total: logs.length,
      checkedOut,
      onSite,
      remote,
      autoCheckout,
    };
  }, [logs]);

  const groupedLogs = useMemo(() => {
    return filteredLogs.reduce((groups: Array<{ dateLabel: string; items: AttendanceReportRecord[] }>, log) => {
      const dateLabel = formatDate(log.date);
      const existingGroup = groups.find((group) => group.dateLabel === dateLabel);

      if (existingGroup) {
        existingGroup.items.push(log);
      } else {
        groups.push({ dateLabel, items: [log] });
      }

      return groups;
    }, []);
  }, [filteredLogs]);

  const selectedEmployee = (employees || []).find((employee: any) => employee.id === employeeId);
  const selectedSite = (sites || []).find((site: any) => site.id === siteId);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={styles.emptyState}>
          <Icon name="alert-circle-outline" size={48} color={theme.colors.error} />
          <Text variant="bodyLarge" style={styles.emptyText}>
            {(error as Error).message}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}>
        <Card style={styles.headerCard}>
          <Card.Content>
            <Text variant="headlineSmall" style={styles.title}>Attendance Logs</Text>
            <Text variant="bodyMedium" style={styles.subtitle}>
              Full employee check-in and check-out history for the last 30 days.
            </Text>
            <Searchbar
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search by employee, site, or location"
              style={styles.searchbar}
            />
            <View style={styles.filterStack}>
              <Menu
                visible={statusMenuVisible}
                onDismiss={() => setStatusMenuVisible(false)}
                anchor={(
                  <View>
                    <Text variant="titleSmall" style={styles.filterLabel}>Attendance Status</Text>
                    <Button mode="outlined" onPress={() => setStatusMenuVisible(true)} style={styles.filterButton} contentStyle={styles.dropdownContent}>
                      {formatOptionLabel(attendanceStatus)}
                    </Button>
                  </View>
                )}>
                {statusOptions.map((status) => (
                  <Menu.Item
                    key={status}
                    onPress={() => { setAttendanceStatus(status); setStatusMenuVisible(false); }}
                    title={formatOptionLabel(status)}
                  />
                ))}
              </Menu>

              <Menu
                visible={employeeMenuVisible}
                onDismiss={() => setEmployeeMenuVisible(false)}
                anchor={(
                  <View>
                    <Text variant="titleSmall" style={styles.filterLabel}>Employee</Text>
                    <Button mode="outlined" onPress={() => setEmployeeMenuVisible(true)} style={styles.filterButton} contentStyle={styles.dropdownContent}>
                      {selectedEmployee ? `${selectedEmployee.first_name} ${selectedEmployee.last_name}` : 'All Employees'}
                    </Button>
                  </View>
                )}>
                <Menu.Item onPress={() => { setEmployeeId(undefined); setEmployeeMenuVisible(false); }} title="All Employees" />
                {(employees || []).map((employee: any) => (
                  <Menu.Item
                    key={employee.id}
                    onPress={() => { setEmployeeId(employee.id); setEmployeeMenuVisible(false); }}
                    title={`${employee.first_name} ${employee.last_name}`}
                  />
                ))}
              </Menu>

              <Menu
                visible={siteMenuVisible}
                onDismiss={() => setSiteMenuVisible(false)}
                anchor={(
                  <View>
                    <Text variant="titleSmall" style={styles.filterLabel}>Site</Text>
                    <Button mode="outlined" onPress={() => setSiteMenuVisible(true)} style={styles.filterButton} contentStyle={styles.dropdownContent}>
                      {selectedSite ? selectedSite.name : 'All Sites'}
                    </Button>
                  </View>
                )}>
                <Menu.Item onPress={() => { setSiteId(undefined); setSiteMenuVisible(false); }} title="All Sites" />
                {(sites || []).map((site: any) => (
                  <Menu.Item
                    key={site.id}
                    onPress={() => { setSiteId(site.id); setSiteMenuVisible(false); }}
                    title={site.name}
                  />
                ))}
              </Menu>
            </View>
            <View style={styles.buttonRow}>
              <Button mode="contained-tonal" onPress={() => refetch()} style={styles.actionButton}>
                Refresh Logs
              </Button>
            </View>
          </Card.Content>
        </Card>

        <View style={styles.summaryGrid}>
          <Card style={styles.summaryCard}>
            <Card.Content>
              <Text variant="headlineSmall" style={styles.summaryValue}>{summary.total}</Text>
              <Text variant="bodySmall" style={styles.summaryLabel}>Total Records</Text>
            </Card.Content>
          </Card>
          <Card style={styles.summaryCard}>
            <Card.Content>
              <Text variant="headlineSmall" style={[styles.summaryValue, { color: colors.success[600] }]}>{summary.checkedOut}</Text>
              <Text variant="bodySmall" style={styles.summaryLabel}>Checked Out</Text>
            </Card.Content>
          </Card>
          <Card style={styles.summaryCard}>
            <Card.Content>
              <Text variant="headlineSmall" style={[styles.summaryValue, { color: colors.warning[600] }]}>{summary.onSite}</Text>
              <Text variant="bodySmall" style={styles.summaryLabel}>Still On Site</Text>
            </Card.Content>
          </Card>
          <Card style={styles.summaryCard}>
            <Card.Content>
              <Text variant="headlineSmall" style={[styles.summaryValue, { color: colors.mutedTeal }]}>{summary.autoCheckout}</Text>
              <Text variant="bodySmall" style={styles.summaryLabel}>Auto Checkouts</Text>
            </Card.Content>
          </Card>
        </View>

        <Card style={styles.infoCard}>
          <Card.Content>
            <Text variant="titleSmall" style={styles.infoTitle}>
              What this screen shows
            </Text>
            <Text variant="bodySmall" style={styles.infoText}>
              Admin can review one full month of employee check-ins, check-outs, locations, pending check-outs, remote work entries, and automatic check-outs in one place.
            </Text>
            <Text variant="bodySmall" style={styles.infoText}>
              Showing {filteredLogs.length} of {logs.length} records
              {summary.remote > 0 ? `, including ${summary.remote} remote-work entries.` : '.'}
            </Text>
          </Card.Content>
        </Card>

        {filteredLogs.length === 0 ? (
          <View style={styles.emptyState}>
            <Icon name="clipboard-text-outline" size={52} color={theme.colors.onSurfaceVariant} />
            <Text variant="bodyLarge" style={styles.emptyText}>
              No attendance records found for the selected filter or search.
            </Text>
          </View>
        ) : (
          groupedLogs.map((group) => (
            <View key={group.dateLabel} style={styles.groupSection}>
              <View style={styles.groupHeader}>
                <Text variant="titleMedium" style={styles.groupTitle}>{group.dateLabel}</Text>
                <Chip compact>{group.items.length} record{group.items.length === 1 ? '' : 's'}</Chip>
              </View>

              {group.items.map((log) => {
                const hasCheckout = Boolean(log.check_out_time);
                const duration = hasCheckout
                  ? formatDuration(log.check_in_time, log.check_out_time!)
                  : null;
                const isRemote = log.attendance_status === 'remote_work';

                return (
                  <Card key={log.attendance_id} style={styles.logCard}>
                    <Card.Content>
                      <View style={styles.logHeader}>
                        <View style={styles.logHeaderText}>
                          <Text variant="titleMedium" style={styles.employeeName}>{log.employee_name}</Text>
                          <Text variant="bodySmall" style={styles.metaText}>
                            {log.site_name}
                          </Text>
                        </View>
                        <Chip
                          icon={log.checkout_type === 'auto_checkout' ? 'robot' : isRemote ? 'home-account' : 'account-check'}
                          style={[
                            styles.checkoutChip,
                            log.checkout_type === 'pending' && styles.pendingChip,
                          ]}>
                          {log.checkout_type === 'pending'
                            ? 'Pending'
                            : log.checkout_type === 'auto_checkout'
                              ? 'Auto'
                              : 'Manual'}
                        </Chip>
                      </View>

                      <View style={styles.row}>
                        <Icon name="clock-in" size={18} color={colors.success[600]} />
                        <Text variant="bodySmall" style={styles.rowText}>
                          Check-in: {formatTime(log.check_in_time)} | {log.check_in_location}
                        </Text>
                      </View>
                      <View style={styles.row}>
                        <Icon name="clock-out" size={18} color={colors.danger[600]} />
                        <Text variant="bodySmall" style={styles.rowText}>
                          Check-out: {hasCheckout ? formatTime(log.check_out_time!) : 'Pending'} | {log.check_out_location}
                        </Text>
                      </View>
                      <View style={styles.detailRow}>
                        <View style={styles.inlineStatus}>
                          <Icon name="map-marker-account" size={18} color={colors.mutedTeal} />
                          <Text variant="bodySmall" style={styles.rowText}>
                            {isRemote ? 'Remote work' : log.attendance_status.replace('_', ' ')}
                          </Text>
                        </View>
                        <View style={styles.inlineStatus}>
                          <Icon name="timer-outline" size={18} color={colors.navyGrey} />
                          <Text variant="bodySmall" style={styles.rowText}>
                            {duration || (parseTimestamp(log.check_in_time) ? 'Open shift' : 'N/A')}
                          </Text>
                        </View>
                      </View>
                    </Card.Content>
                  </Card>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  headerCard: { marginBottom: 16 },
  title: { fontWeight: '700', marginBottom: 6 },
  subtitle: { opacity: 0.7, marginBottom: 12 },
  searchbar: { marginBottom: 12 },
  filterStack: { gap: 14, marginBottom: 12 },
  filterLabel: { fontWeight: '600', marginBottom: 8 },
  filterButton: { alignSelf: 'stretch' },
  dropdownContent: { justifyContent: 'space-between', minHeight: 52 },
  buttonRow: { gap: 10, marginBottom: 4 },
  actionButton: { marginBottom: 0 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  summaryCard: { width: '47%' },
  summaryValue: { fontWeight: '700' },
  summaryLabel: { opacity: 0.7, marginTop: 4 },
  infoCard: { marginBottom: 16, backgroundColor: colors.almostWhite },
  infoTitle: { fontWeight: '700', marginBottom: 6 },
  infoText: { opacity: 0.75, marginBottom: 4 },
  groupSection: { marginBottom: 18 },
  groupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  groupTitle: { fontWeight: '700' },
  logCard: { marginBottom: 12 },
  logHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  logHeaderText: { flex: 1, marginRight: 10 },
  employeeName: { fontWeight: '600', marginBottom: 4 },
  metaText: { opacity: 0.7 },
  checkoutChip: { alignSelf: 'flex-start' },
  pendingChip: { backgroundColor: colors.warning[100] },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  detailRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  inlineStatus: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  rowText: { marginLeft: 8, flex: 1, opacity: 0.8 },
  emptyState: { alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { marginTop: 12, textAlign: 'center', opacity: 0.7 },
});
