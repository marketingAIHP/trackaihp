import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Menu, Text, TextInput, useTheme } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../hooks/useAuth';
import { adminApi } from '../../services/api';
import { getLocationTimeline } from '../../services/locationTimelineService';
import { formatDate, formatTime } from '../../utils/format';

type Period = 'daily' | 'weekly' | 'monthly';
const label = (value: string) => value.split('_').map((part) => part[0].toUpperCase() + part.slice(1)).join(' ');

function rangeFor(period: Period, date: string) {
  const local = new Date(`${date}T00:00:00`);
  if (period === 'weekly') local.setDate(local.getDate() - ((local.getDay() + 6) % 7));
  if (period === 'monthly') local.setDate(1);
  const start = new Date(local);
  const end = new Date(start);
  if (period === 'daily') end.setDate(end.getDate() + 1);
  if (period === 'weekly') end.setDate(end.getDate() + 7);
  if (period === 'monthly') end.setMonth(end.getMonth() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

export const LocationTimelineScreen: React.FC = () => {
  const theme = useTheme();
  const { currentUser } = useAuth();
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [date, setDate] = useState(today);
  const [period, setPeriod] = useState<Period>('daily');
  const [employeeMenu, setEmployeeMenu] = useState(false);
  const [periodMenu, setPeriodMenu] = useState(false);
  const employeesQuery = useQuery({
    queryKey: ['admin', 'timeline-employees', currentUser?.id],
    queryFn: async () => {
      const result = await adminApi.getEmployees(currentUser!.id);
      return result.success ? result.data || [] : [];
    },
    enabled: !!currentUser?.id,
    staleTime: 300000,
  });
  const range = useMemo(() => rangeFor(period, date), [period, date]);
  const timelineQuery = useQuery({
    queryKey: ['admin', 'location-timeline', employeeId, range.from, range.to],
    queryFn: () => getLocationTimeline(employeeId!, range.from, range.to),
    enabled: !!employeeId && /^\d{4}-\d{2}-\d{2}$/.test(date),
  });
  const employee = (employeesQuery.data || []).find((item: any) => item.id === employeeId);

  return <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
    <ScrollView contentContainerStyle={styles.content}>
      <Card><Card.Content>
        <Text variant="headlineSmall">Employee Location Timeline</Text>
        <Text variant="bodyMedium" style={styles.help}>Historical, read-only location events collected after deployment.</Text>
        <Menu visible={employeeMenu} onDismiss={() => setEmployeeMenu(false)} anchor={<Button mode="outlined" onPress={() => setEmployeeMenu(true)} style={styles.field}>{employee ? `${employee.first_name} ${employee.last_name}` : 'Select employee'}</Button>}>
          {(employeesQuery.data || []).map((item: any) => <Menu.Item key={item.id} title={`${item.first_name} ${item.last_name}`} onPress={() => { setEmployeeId(item.id); setEmployeeMenu(false); }} />)}
        </Menu>
        <Menu visible={periodMenu} onDismiss={() => setPeriodMenu(false)} anchor={<Button mode="outlined" onPress={() => setPeriodMenu(true)} style={styles.field}>{label(period)}</Button>}>
          {(['daily', 'weekly', 'monthly'] as Period[]).map((item) => <Menu.Item key={item} title={label(item)} onPress={() => { setPeriod(item); setPeriodMenu(false); }} />)}
        </Menu>
        <TextInput mode="outlined" label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} style={styles.field} />
        <Button mode="outlined" onPress={() => timelineQuery.refetch()} disabled={!employeeId}>Refresh timeline</Button>
      </Card.Content></Card>
      {timelineQuery.isLoading ? <Text style={styles.empty}>Loading timeline...</Text> : null}
      {timelineQuery.error ? <Text style={styles.empty}>Could not load timeline. Check your authorization and try again.</Text> : null}
      {!timelineQuery.isLoading && employeeId && (timelineQuery.data || []).length === 0 ? <Text style={styles.empty}>No timeline events in this period.</Text> : null}
      {(timelineQuery.data || []).map((event: any) => <Card key={event.id} style={styles.event}><Card.Content>
        <Text variant="titleMedium">{formatTime(event.event_time)}  {label(event.event_type)}</Text>
        <Text variant="bodyMedium">{event.location_name}</Text>
        {event.full_address || event.site?.address ? <Text variant="bodySmall">{event.full_address || event.site.address}</Text> : null}
        {event.latitude != null && event.longitude != null ? <Text variant="bodySmall">{event.latitude}, {event.longitude}{event.accuracy != null ? `"��y��y� �${event.accuracy}m` : ''}</Text> : null}
        <Text variant="bodySmall">{formatDate(event.event_time)}{event.attendance_id ? ` �w^~)�v Attendance #${event.attendance_id}` : ''}</Text>
      </Card.Content></Card>)}
      <Button mode="text" onPress={() => Alert.alert('Exports', 'Timeline export is not available until its PDF/CSV builder is added.')} disabled>PDF / CSV export</Button>
    </ScrollView>
  </SafeAreaView>;
};
const styles = StyleSheet.create({
  container: { flex: 1 }, content: { padding: 16, gap: 12 }, help: { marginTop: 6, marginBottom: 12 },
  field: { marginBottom: 10 }, event: { marginTop: 2 }, empty: { textAlign: 'center', marginTop: 24, opacity: 0.7 },
});

