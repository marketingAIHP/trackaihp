import React, { useMemo, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Menu, Text, TextInput, useTheme } from 'react-native-paper';
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

const periodOptions: Array<NonNullable<AttendanceReportFilters['period']>> = ['monthly', 'quarterly', 'yearly', 'custom'];
const statusOptions: AttendanceStatusFilter[] = ['all', 'on_site', 'checked_out', 'remote_work'];
const quarterOptions = [
  { value: 1, label: 'Q1 (Jan - Mar)' },
  { value: 2, label: 'Q2 (Apr - Jun)' },
  { value: 3, label: 'Q3 (Jul - Sep)' },
  { value: 4, label: 'Q4 (Oct - Dec)' },
] as const;
const monthOptions = [
  { value: 0, label: 'January' },
  { value: 1, label: 'February' },
  { value: 2, label: 'March' },
  { value: 3, label: 'April' },
  { value: 4, label: 'May' },
  { value: 5, label: 'June' },
  { value: 6, label: 'July' },
  { value: 7, label: 'August' },
  { value: 8, label: 'September' },
  { value: 9, label: 'October' },
  { value: 10, label: 'November' },
  { value: 11, label: 'December' },
] as const;
const webDateInputStyle = {
  minWidth: 160,
  width: '100%',
  minHeight: 56,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: '#7b97b4',
  padding: '0 14px',
  fontSize: 16,
  color: '#1f2937',
  backgroundColor: '#ffffff',
  outlineColor: '#7b97b4',
  boxSizing: 'border-box',
} as const;

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toStartOfDayIso(value: string) {
  return new Date(`${value}T00:00:00`).toISOString();
}

function toEndOfDayIso(value: string) {
  return new Date(`${value}T23:59:59.999`).toISOString();
}

function isValidDateInput(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());
}

function getDateRange(
  period: NonNullable<AttendanceReportFilters['period']>,
  selectedYear: number,
  selectedMonth: number,
  selectedQuarter: number,
  manualDateFrom: string,
  manualDateTo: string
) {
  if (period === 'monthly') {
    const start = new Date(selectedYear, selectedMonth, 1, 0, 0, 0, 0);
    const end = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59, 999);
    return {
      dateFrom: start.toISOString(),
      dateTo: end.toISOString(),
    };
  }

  if (period === 'quarterly') {
    const startMonth = (selectedQuarter - 1) * 3;
    const start = new Date(selectedYear, startMonth, 1, 0, 0, 0, 0);
    const end = new Date(selectedYear, startMonth + 3, 0, 23, 59, 59, 999);
    return {
      dateFrom: start.toISOString(),
      dateTo: end.toISOString(),
    };
  }

  if (period === 'yearly') {
    const start = new Date(selectedYear, 0, 1, 0, 0, 0, 0);
    const end = new Date(selectedYear, 11, 31, 23, 59, 59, 999);
    return {
      dateFrom: start.toISOString(),
      dateTo: end.toISOString(),
    };
  }

  if (!isValidDateInput(manualDateFrom) || !isValidDateInput(manualDateTo)) {
    return {
      dateFrom: undefined,
      dateTo: undefined,
    };
  }

  return {
    dateFrom: toStartOfDayIso(manualDateFrom),
    dateTo: toEndOfDayIso(manualDateTo),
  };
}

function formatOptionLabel(value: string) {
  if (value === 'custom') return 'Manual';
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
  const now = useMemo(() => new Date(), []);
  const today = useMemo(() => toDateInputValue(now), [now]);
  const currentQuarter = Math.floor(now.getMonth() / 3) + 1;
  const yearOptions = useMemo(() => {
    const currentYear = now.getFullYear();
    return Array.from({ length: 8 }, (_, index) => currentYear - index);
  }, [now]);
  const [period, setPeriod] = useState<NonNullable<AttendanceReportFilters['period']>>('monthly');
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedQuarter, setSelectedQuarter] = useState(currentQuarter);
  const [manualDateFrom, setManualDateFrom] = useState(today);
  const [manualDateTo, setManualDateTo] = useState(today);
  const [attendanceStatus, setAttendanceStatus] = useState<AttendanceStatusFilter>('all');
  const [periodMenuVisible, setPeriodMenuVisible] = useState(false);
  const [yearMenuVisible, setYearMenuVisible] = useState(false);
  const [monthMenuVisible, setMonthMenuVisible] = useState(false);
  const [quarterMenuVisible, setQuarterMenuVisible] = useState(false);
  const [statusMenuVisible, setStatusMenuVisible] = useState(false);
  const [employeeMenuVisible, setEmployeeMenuVisible] = useState(false);
  const [siteMenuVisible, setSiteMenuVisible] = useState(false);
  const [employeeId, setEmployeeId] = useState<number | undefined>();
  const [siteId, setSiteId] = useState<number | undefined>();

  const filters = useMemo<AttendanceReportFilters>(() => ({
    ...getDateRange(period, selectedYear, selectedMonth, selectedQuarter, manualDateFrom, manualDateTo),
    period,
    attendanceStatus,
    employeeId,
    siteId,
  }), [attendanceStatus, employeeId, manualDateFrom, manualDateTo, period, selectedMonth, selectedQuarter, selectedYear, siteId]);

  const selectedMonthLabel = monthOptions.find((option) => option.value === selectedMonth)?.label || 'Select Month';
  const selectedQuarterLabel = quarterOptions.find((option) => option.value === selectedQuarter)?.label || 'Select Quarter';
  const selectedYearLabel = String(selectedYear);
  const hasValidManualDates =
    isValidDateInput(manualDateFrom) &&
    isValidDateInput(manualDateTo) &&
    new Date(`${manualDateFrom}T00:00:00`).getTime() <= new Date(`${manualDateTo}T00:00:00`).getTime();

  const downloadSuffix = useMemo(() => {
    if (period === 'monthly') {
      return `${selectedMonthLabel.toLowerCase().replace(/\s+/g, '-')}-${selectedYear}`;
    }
    if (period === 'quarterly') {
      return `q${selectedQuarter}-${selectedYear}`;
    }
    if (period === 'yearly') {
      return `${selectedYear}`;
    }
    return `${manualDateFrom}-to-${manualDateTo}`;
  }, [manualDateFrom, manualDateTo, period, selectedMonthLabel, selectedQuarter, selectedYear]);

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
      if (period === 'custom' && !hasValidManualDates) {
        Alert.alert('Invalid date range', 'Please enter a valid From Date and To Date. The From Date must be before or equal to the To Date.');
        return;
      }
      if (rows.length === 0) {
        Alert.alert('No data to download', 'Change the filters or refresh the report before downloading.');
        return;
      }

      const path = await savePlatformReportFile(
        `attendance-report-${downloadSuffix}.csv`,
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
      if (period === 'custom' && !hasValidManualDates) {
        Alert.alert('Invalid date range', 'Please enter a valid From Date and To Date. The From Date must be before or equal to the To Date.');
        return;
      }
      if (rows.length === 0) {
        Alert.alert('No data to download', 'Change the filters or refresh the report before downloading.');
        return;
      }

      const path = await savePlatformReportFile(
        `attendance-report-${downloadSuffix}.pdf`,
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
              Monthly, quarterly, yearly, and manual downloads with checkout type and stored check-in/check-out locations.
            </Text>

            <View style={[styles.filterStack, isWideWeb && styles.webFilterStack]}>
              <View style={styles.filterField}>
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
              </View>

              {(period === 'monthly' || period === 'quarterly' || period === 'yearly') && (
                <View style={styles.filterField}>
                  <Text variant="titleSmall" style={styles.label}>Year</Text>
                  <Menu
                    visible={yearMenuVisible}
                    onDismiss={() => setYearMenuVisible(false)}
                    anchor={
                      <Button mode="outlined" onPress={() => setYearMenuVisible(true)} style={styles.dropdownButton} contentStyle={styles.dropdownContent}>
                        {selectedYearLabel}
                      </Button>
                    }>
                    {yearOptions.map((year) => (
                      <Menu.Item
                        key={year}
                        onPress={() => { setSelectedYear(year); setYearMenuVisible(false); }}
                        title={String(year)}
                      />
                    ))}
                  </Menu>
                </View>
              )}

              {period === 'monthly' && (
                <View style={styles.filterField}>
                  <Text variant="titleSmall" style={styles.label}>Month</Text>
                  <Menu
                    visible={monthMenuVisible}
                    onDismiss={() => setMonthMenuVisible(false)}
                    anchor={
                      <Button mode="outlined" onPress={() => setMonthMenuVisible(true)} style={styles.dropdownButton} contentStyle={styles.dropdownContent}>
                        {selectedMonthLabel}
                      </Button>
                    }>
                    {monthOptions.map((option) => (
                      <Menu.Item
                        key={option.value}
                        onPress={() => { setSelectedMonth(option.value); setMonthMenuVisible(false); }}
                        title={option.label}
                      />
                    ))}
                  </Menu>
                </View>
              )}

              {period === 'quarterly' && (
                <View style={styles.filterField}>
                  <Text variant="titleSmall" style={styles.label}>Quarter</Text>
                  <Menu
                    visible={quarterMenuVisible}
                    onDismiss={() => setQuarterMenuVisible(false)}
                    anchor={
                      <Button mode="outlined" onPress={() => setQuarterMenuVisible(true)} style={styles.dropdownButton} contentStyle={styles.dropdownContent}>
                        {selectedQuarterLabel}
                      </Button>
                    }>
                    {quarterOptions.map((option) => (
                      <Menu.Item
                        key={option.value}
                        onPress={() => { setSelectedQuarter(option.value); setQuarterMenuVisible(false); }}
                        title={option.label}
                      />
                    ))}
                  </Menu>
                </View>
              )}

              {period === 'custom' && (
                <>
                  <View style={styles.filterField}>
                    <Text variant="titleSmall" style={styles.label}>From Date</Text>
                    {Platform.OS === 'web' ? (
                      <input
                        type="date"
                        value={manualDateFrom}
                        onChange={(event) => setManualDateFrom(event.currentTarget.value)}
                        max={manualDateTo || undefined}
                        style={webDateInputStyle as any}
                      />
                    ) : (
                      <TextInput
                        mode="outlined"
                        value={manualDateFrom}
                        onChangeText={setManualDateFrom}
                        placeholder="YYYY-MM-DD"
                        style={styles.dateInput}
                      />
                    )}
                  </View>
                  <View style={styles.filterField}>
                    <Text variant="titleSmall" style={styles.label}>To Date</Text>
                    {Platform.OS === 'web' ? (
                      <input
                        type="date"
                        value={manualDateTo}
                        onChange={(event) => setManualDateTo(event.currentTarget.value)}
                        min={manualDateFrom || undefined}
                        max={today}
                        style={webDateInputStyle as any}
                      />
                    ) : (
                      <TextInput
                        mode="outlined"
                        value={manualDateTo}
                        onChangeText={setManualDateTo}
                        placeholder="YYYY-MM-DD"
                        style={styles.dateInput}
                      />
                    )}
                  </View>
                  <View style={styles.manualButtonGroup}>
                    <Button mode="outlined" onPress={() => { setManualDateFrom(today); setManualDateTo(today); }}>
                      Today
                    </Button>
                  </View>
                </>
              )}

              <Menu
                visible={statusMenuVisible}
                onDismiss={() => setStatusMenuVisible(false)}
                anchor={
                  <View style={styles.filterField}>
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
                  <View style={styles.filterField}>
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
                  <View style={styles.filterField}>
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
              <Button
                mode="contained"
                onPress={() => {
                  if (period === 'custom' && !hasValidManualDates) {
                    Alert.alert('Invalid date range', 'Please enter a valid From Date and To Date. The From Date must be before or equal to the To Date.');
                    return;
                  }
                  void refetch();
                }}
                style={styles.actionButton}>
                Refresh
              </Button>
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
  label: { fontWeight: '600', marginBottom: 8 },
  filterStack: { gap: 14, marginBottom: 16 },
  webFilterStack: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: 16,
  },
  filterField: {
    minWidth: 160,
  },
  dropdownButton: { alignSelf: 'stretch' },
  dropdownContent: { justifyContent: 'space-between', minHeight: 52 },
  dateInput: {
    minWidth: 160,
    backgroundColor: 'transparent',
  },
  manualButtonGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
    paddingTop: 30,
  },
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
