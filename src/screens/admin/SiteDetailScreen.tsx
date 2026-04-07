import React from 'react';
import { View, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, Text, useTheme, Divider } from 'react-native-paper';
import { useRoute } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { adminApi } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { Attendance, Employee } from '../../types';
import { Avatar } from '../../components/common/Avatar';
import { formatTime } from '../../utils/format';

export const SiteDetailScreen: React.FC = () => {
  const theme = useTheme();
  const route = useRoute();
  const { currentUser } = useAuth();
  const adminId = currentUser?.id || 0;
  const siteId = (route.params as any)?.siteId;

  const { data, isLoading, refetch, isRefetching, error } = useQuery({
    queryKey: ['admin', 'site-detail', adminId, siteId],
    queryFn: async () => {
      const response = await adminApi.getSiteAttendanceSummary(adminId, siteId);
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.error || 'Failed to load site details');
    },
    enabled: !!adminId && !!siteId,
    refetchInterval: 30000,
  });

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (error || !data) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <View style={styles.centered}>
          <Icon name="alert-circle-outline" size={48} color={theme.colors.error} />
          <Text variant="bodyLarge" style={styles.errorText}>
            {(error as Error)?.message || 'Unable to load site details'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const renderOnSiteEmployee = ({ item }: { item: Attendance }) => {
    const employee = item.employee;
    if (!employee) return null;

    return (
      <View style={styles.row}>
        <Avatar imageUri={employee.profile_image} firstName={employee.first_name} lastName={employee.last_name} size={48} />
        <View style={styles.rowContent}>
          <Text variant="titleSmall" style={styles.name}>
            {employee.first_name} {employee.last_name}
          </Text>
          <Text variant="bodySmall" style={styles.subtext}>
            Checked in at {formatTime(item.check_in_time)}
          </Text>
          <Text variant="bodySmall" style={styles.subtext}>
            {item.check_in_location_name || 'Unnamed Location'}
          </Text>
        </View>
        <Icon name="map-marker-check" size={22} color={theme.colors.primary} />
      </View>
    );
  };

  const renderOfflineEmployee = ({ item }: { item: Employee }) => (
    <View style={styles.row}>
      <Avatar imageUri={item.profile_image} firstName={item.first_name} lastName={item.last_name} size={48} />
      <View style={styles.rowContent}>
        <Text variant="titleSmall" style={styles.name}>
          {item.first_name} {item.last_name}
        </Text>
        <Text variant="bodySmall" style={styles.subtext}>
          Assigned to this site but not currently checked in
        </Text>
      </View>
      <Icon name="account-off-outline" size={22} color={theme.colors.onSurfaceVariant} />
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <FlatList
        data={[{ key: 'header' }]}
        keyExtractor={(item) => item.key}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        renderItem={() => (
          <View style={styles.content}>
            <Card style={styles.heroCard}>
              <Card.Content>
                <Text variant="headlineSmall" style={styles.siteName}>
                  {data.site.name}
                </Text>
                <Text variant="bodyMedium" style={styles.address}>
                  {data.site.address}
                </Text>
                <Text variant="bodySmall" style={styles.address}>
                  Radius: {data.site.geofence_radius}m
                </Text>
              </Card.Content>
            </Card>

            <Card style={styles.sectionCard}>
              <Card.Content>
                <Text variant="titleMedium" style={styles.sectionTitle}>
                  On-Site Employees ({data.onSiteEmployees.length})
                </Text>
                {data.onSiteEmployees.length === 0 ? (
                  <Text variant="bodyMedium" style={styles.emptyText}>No employees are checked in at this site.</Text>
                ) : (
                  <FlatList
                    data={data.onSiteEmployees}
                    keyExtractor={(item) => `on-site-${item.id}`}
                    renderItem={renderOnSiteEmployee}
                    scrollEnabled={false}
                    ItemSeparatorComponent={() => <Divider />}
                  />
                )}
              </Card.Content>
            </Card>

            <Card style={styles.sectionCard}>
              <Card.Content>
                <Text variant="titleMedium" style={styles.sectionTitle}>
                  Offline Employees ({data.offlineEmployees.length})
                </Text>
                {data.offlineEmployees.length === 0 ? (
                  <Text variant="bodyMedium" style={styles.emptyText}>All assigned employees are currently on-site.</Text>
                ) : (
                  <FlatList
                    data={data.offlineEmployees}
                    keyExtractor={(item) => `offline-${item.id}`}
                    renderItem={renderOfflineEmployee}
                    scrollEnabled={false}
                    ItemSeparatorComponent={() => <Divider />}
                  />
                )}
              </Card.Content>
            </Card>
          </View>
        )}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { marginTop: 12, textAlign: 'center' },
  heroCard: { marginBottom: 16 },
  siteName: { fontWeight: '700', marginBottom: 6 },
  address: { opacity: 0.7, marginBottom: 4 },
  sectionCard: { marginBottom: 16 },
  sectionTitle: { fontWeight: '700', marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  rowContent: { flex: 1, marginLeft: 12 },
  name: { fontWeight: '600', marginBottom: 4 },
  subtext: { opacity: 0.7 },
  emptyText: { opacity: 0.7 },
});
