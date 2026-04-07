import React, { useMemo, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Menu, Text, useTheme } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { AttendanceReportFilters, AttendanceStatusFilter } from '../../types';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { formatDate } from '../../utils/format';
import { savePlatformReportFile } from '../../services/reportDownloader';
import {
  buildAttendanceReportCsv,
  buildAttendanceReportPdf,
} from '../../services/reports/exportBuilders';

const periodOptions: Array<NonNullable<AttendanceReportFilters['period']>> = ['monthly', 'quarterly', 'yearly'];
const statusOptions: AttendanceStatusFilter[] = ['all', 'on_site', 'checked_out', 'remote_work'];

function getDateRange(period: NonNullable<AttendanceReportFilters['period']>) {
  const now = new Date();
  const start = new Date(now);

  if (period === 'monthly') {
    start.setMonth(now.getMonth() - 1);
  } else if (period === 'quarterly') {
    start.setMonth(now.getMonth() - 3);
  } else {
    start.setFullYear(now.getFullYear() - 1);
  }

  return {
    dateFrom: start.toISOString(),
    dateTo: now.toISOString(),
  };
}

function formatOptionLabel(value: string) {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export const ReportsScreen: React.FC = () => {
  const theme = useTheme();
  const { currentUser } = useAuth();
  const adminId = currentUser?.id || 0;
  const { width } = useWindowDimensions();
  const isWideWeb = Platform.OS === 'web' && width >= 768;
  const [period, setPeriod] = useState<NonNullable<AttendanceReportFilters['period']>>('monthly');
  const [attendanceStatus, setAttendanceStatus] = useState<AttendanceStatusFilter>('all');
  const [periodMenuVisible, setPeriodMenuVisible] = useState(false);
  const [statusMenuVisible, setStatusMenuVisible] = useState(false);
  const [employeeMenuVisible, setEmployeeMenuVisible] = useState(false);
  const [siteMenuVisible, setSiteMenuVisible] = useState(false);
  const [employeeId, setEmployeeId] = useState<number | undefined>();
  const [siteId, setSiteId] = useState<number | undefined>();

  const filters = useMemo<AttendanceReportFilters>(() => ({
    ...getDateRange(period),
    period,
    attendanceStatus,
    employeeId,
    siteId,
  }), [attendanceStatus, employeeId, period, siteId]);

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

  const { data: reportRows, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'reports', adminId, filters],
    queryFn: async () => {
      const response = await adminApi.getAttendanceReport(adminId, filters);
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.error || 'Failed to load reports');
    },
    enabled: !!adminId,
  });

  const downloadExcel = async () => {
    try {
      const rows = reportRows || [];
      if (rows.length === 0) {
        Alert.alert('No data to download', 'Change the filters or refresh the report before downloading.');
        return;
      }

      const path = await savePlatformReportFile(
        `attendance-report-${period}.csv`,
        buildAttendanceReportCsv(rows),
        'text/csv'
      );

      Alert.alert(
        'Excel download complete',
        Platform.OS === 'web' ? 'The browser download has started.' : `Saved to:\n${path}`
      );
    } catch (error: any) {
      Alert.alert('Download failed', error.message || 'Could not download the Excel file.');
    }
  };

  const downloadPdf = async () => {
    try {
      const rows = reportRows || [];
      if (rows.length === 0) {
        Alert.alert('No data to download', 'Change the filters or refresh the report before downloading.');
        return;
      }

      const path = await savePlatformReportFile(
        `attendance-report-${period}.pdf`,
        buildAttendanceReportPdf(rows),
        'application/pdf'
      );

      Alert.alert(
        'PDF download complete',
        Platform.OS === 'web' ? 'The browser download has started.' : `Saved to:\n${path}`
      );
    } catch (error: any) {
      Alert.alert('Download failed', error.message || 'Could not download the PDF file.');
    }
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={[styles.content, isWideWeb && styles.webContent]}>
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="headlineSmall" style={styles.title}>Attendance Reports</Text>
            <Text variant="bodyMedium" style={styles.subtitle}>
              Monthly, quarterly, and yearly downloads with checkout type and stored check-in/check-out locations.
            </Text>
            <Text variant="bodySmall" style={styles.helperText}>
              {Platform.OS === 'web'
                ? 'Web exports use browser downloads for the same report data. Android keeps the existing file-system save flow.'
                : 'Android keeps the file-system save flow. The web PWA uses the same report data through browser downloads.'}
            </Text>

            <View style={[styles.filterStack, isWideWeb && styles.webFilterStack]}>
              <Text variant="titleSmall" style={styles.label}>Period</Text>
              <Menu
                visible={periodMenuVisible}
                onDismiss={() => setPeriodMenuVisible(false)}
                anchor={
                  <Button mode="outlined" onPress={() => setPeriodMenuVisible(true)} style={styles.dropdownButton} contentStyle={styles.dropdownContent}>
                    {formatOptionLabel(period)}
                  </Button>
                }>
                {periodOptions.map((option) => (
                  <Menu.Item
                    key={option}
                    onPress={() => { setPeriod(option); setPeriodMenuVisible(false); }}
                    title={formatOptionLabel(option)}
                  />
                ))}
              </Menu>

              <Menu
                visible={statusMenuVisible}
                onDismiss={() => setStatusMenuVisible(false)}
                anchor={
                  <View>
                    <Text variant="titleSmall" style={styles.label}>Attendance Status</Text>
                    <Button mode="outlined" onPress={() => setStatusMenuVisible(true)} style={styles.dropdownButton} contentStyle={styles.dropdownContent}>
                      {formatOptionLabel(attendanceStatus)}
                    </Button>
                  </View>
                }>
                {statusOptions.map((option) => (
                  <Menu.Item
                    key={option}
                    onPress={() => { setAttendanceStatus(option); setStatusMenuVisible(false); }}
                    title={formatOptionLabel(option)}
                  />
                ))}
              </Menu>

              <Menu
                visible={employeeMenuVisible}
                onDismiss={() => setEmployeeMenuVisible(false)}
                anchor={
                  <View>
                    <Text variant="titleSmall" style={styles.label}>Employee</Text>
                    <Button mode="outlined" onPress={() => setEmployeeMenuVisible(true)} style={styles.dropdownButton} contentStyle={styles.dropdownContent}>
                      {employeeId
                        ? `${(employees || []).find((employee: any) => employee.id === employeeId)?.first_name || ''} ${(employees || []).find((employee: any) => employee.id === employeeId)?.last_name || ''}`.trim()
                        : 'All Employees'}
                    </Button>
                  </View>
                }>
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
                anchor={
                  <View>
                    <Text variant="titleSmall" style={styles.label}>Site</Text>
                    <Button mode="outlined" onPress={() => setSiteMenuVisible(true)} style={styles.dropdownButton} contentStyle={styles.dropdownContent}>
                      {siteId
                        ? (sites || []).find((site: any) => site.id === siteId)?.name || 'All Sites'
                        : 'All Sites'}
                    </Button>
                  </View>
                }>
                <Menu.Item onPress={() => { setSiteId(undefined); setSiteMenuVisible(false); }} title="All Sites" />
                {(sites || []).map((site: any) => (
                  <Menu.Item key={site.id} onPress={() => { setSiteId(site.id); setSiteMenuVisible(false); }} title={site.name} />
                ))}
              </Menu>
            </View>

            <View style={[styles.buttonRow, isWideWeb && styles.webButtonRow]}>
              <Button mode="contained" onPress={() => refetch()} style={styles.actionButton}>Refresh</Button>
              <Button mode="contained-tonal" onPress={downloadExcel} style={styles.actionButton}>Download Excel</Button>
              <Button mode="contained-tonal" onPress={downloadPdf} style={styles.actionButton}>Download PDF</Button>
            </View>
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.previewTitle}>
              Preview ({reportRows?.length || 0} records)
            </Text>
            {(reportRows || []).length === 0 ? (
              <Text variant="bodyMedium" style={styles.subtitle}>No records match the selected filters.</Text>
            ) : (
              (reportRows || []).slice(0, 20).map((row) => (
                <View key={row.attendance_id} style={styles.previewRow}>
                  <Text variant="titleSmall" style={styles.rowName}>{row.employee_name}</Text>
                  <Text variant="bodySmall" style={styles.rowMeta}>
                    {formatDate(row.date)} | {row.site_name} | {row.checkout_type}
                  </Text>
                  <Text variant="bodySmall" style={styles.rowMeta}>
                    In: {row.check_in_location}
                  </Text>
                  <Text variant="bodySmall" style={styles.rowMeta}>
                    Out: {row.check_out_location}
                  </Text>
                </View>
              ))
            )}
          </Card.Content>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  webContent: {
    width: '100%',
    maxWidth: 1200,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  card: { marginBottom: 16 },
  title: { fontWeight: '700', marginBottom: 6 },
  subtitle: { opacity: 0.7, marginBottom: 12 },
  helperText: { opacity: 0.65, marginBottom: 12 },
  label: { fontWeight: '600', marginBottom: 8 },
  filterStack: { gap: 14, marginBottom: 16 },
  webFilterStack: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    gap: 16,
  },
  dropdownButton: { alignSelf: 'stretch' },
  dropdownContent: { justifyContent: 'space-between', minHeight: 52 },
  buttonRow: { gap: 10 },
  webButtonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  actionButton: { marginBottom: 10 },
  previewTitle: { fontWeight: '700', marginBottom: 12 },
  previewRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#ececec' },
  rowName: { fontWeight: '600', marginBottom: 4 },
  rowMeta: { opacity: 0.75, marginBottom: 2 },
});
