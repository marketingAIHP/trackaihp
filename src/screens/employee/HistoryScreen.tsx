import React from 'react';
import {View, StyleSheet, FlatList, RefreshControl, Platform, useWindowDimensions} from 'react-native';
import {Text, Card, useTheme, Chip} from 'react-native-paper';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useQuery} from '@tanstack/react-query';
import {employeeApi} from '../../services/api';
import {useAuth} from '../../hooks/useAuth';
import {LoadingSpinner} from '../../components/common/LoadingSpinner';
import {Attendance} from '../../types';
import {formatDateTime, formatDuration} from '../../utils/format';
import {MaterialCommunityIcons as Icon} from '@expo/vector-icons';
import {useFocusEffect} from '@react-navigation/native';
import {colors} from '../../theme/colors';

export const HistoryScreen: React.FC = () => {
  const theme = useTheme();
  const {currentUser} = useAuth();
  const employeeId = currentUser?.id || 0;
  const {width} = useWindowDimensions();
  const isWideWeb = Platform.OS === 'web' && width >= 768;

  const {data: attendanceHistory, isLoading, refetch, isRefetching, error: historyError} = useQuery({
    queryKey: ['employee', 'attendance', 'history', employeeId],
    queryFn: async () => {
      const response = await employeeApi.getAttendanceHistory(employeeId);
      if (response.success) {
        // Return empty array if no data, but still success
        return response.data || [];
      }
      throw new Error(response.error || 'Failed to load attendance history');
    },
    enabled: !!employeeId,
    refetchOnMount: true, // Always refetch when component mounts
    refetchOnWindowFocus: true, // Refetch when window comes into focus
    staleTime: 0, // Always consider data stale to ensure fresh data
  });

  // Refetch when screen comes into focus to ensure latest data
  useFocusEffect(
    React.useCallback(() => {
      if (employeeId) {
        refetch();
      }
    }, [employeeId, refetch])
  );

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (historyError) {
    return (
      <SafeAreaView style={[styles.container, {backgroundColor: theme.colors.background}]} edges={['top']}>
        <View style={styles.emptyContainer}>
          <Icon name="alert-circle" size={64} color={theme.colors.error} />
          <Text variant="bodyLarge" style={styles.emptyText}>
            Error loading history
          </Text>
          <Text variant="bodySmall" style={styles.emptyText}>
            {(historyError as Error).message}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const renderAttendance = ({item}: {item: Attendance}) => {
    const isComplete = !!item.check_out_time;
    const duration = isComplete && item.check_out_time
      ? formatDuration(item.check_in_time, item.check_out_time)
      : 'In progress';

    return (
      <Card style={styles.attendanceCard}>
        <Card.Content>
          <View style={styles.attendanceHeader}>
            <Icon
              name={isComplete ? 'check-circle' : 'clock-outline'}
              size={24}
              color={isComplete ? colors.success[600] : colors.warning[600]}
            />
            <View style={styles.attendanceInfo}>
              <Text variant="titleMedium" style={styles.siteName}>
                {item.site?.name || 'Unknown Site'}
              </Text>
              <Text variant="bodySmall" style={styles.date}>
                {formatDateTime(item.check_in_time)}
              </Text>
            </View>
          </View>
          <View style={styles.attendanceDetails}>
            <View style={styles.detailRow}>
              <Icon name="clock-in" size={16} color={theme.colors.primary} />
              <Text variant="bodySmall" style={styles.detailText}>
                Check-in: {formatDateTime(item.check_in_time)}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Icon name="map-marker" size={16} color={theme.colors.primary} />
              <Text variant="bodySmall" style={styles.detailText}>
                {item.check_in_location_name || 'Unnamed Location'}
              </Text>
            </View>
            {item.check_out_time && (
              <>
                <View style={styles.detailRow}>
                  <Icon name="clock-out" size={16} color={theme.colors.error} />
                  <Text variant="bodySmall" style={styles.detailText}>
                    Check-out: {formatDateTime(item.check_out_time)}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Icon name="map-marker-outline" size={16} color={theme.colors.error} />
                  <Text variant="bodySmall" style={styles.detailText}>
                    {item.check_out_location_name || 'Unnamed Location'}
                  </Text>
                </View>
              </>
            )}
            <View style={styles.chipRow}>
              <Chip
                icon="timer"
                style={styles.durationChip}
                textStyle={styles.durationChipText}>
                {duration}
              </Chip>
              {item.check_out_time && (
                <Chip
                  icon={item.checkout_type === 'auto_checkout' ? 'robot' : 'account-check'}
                  style={styles.durationChip}
                  textStyle={styles.durationChipText}>
                  {item.checkout_type === 'auto_checkout' ? 'Auto checkout' : 'Manual checkout'}
                </Chip>
              )}
              {item.is_remote_location && (
                <Chip
                  icon="home-export-outline"
                  style={styles.durationChip}
                  textStyle={styles.durationChipText}>
                  Remote Work
                </Chip>
              )}
            </View>
          </View>
        </Card.Content>
      </Card>
    );
  };

  // Filter out any invalid records, but keep all valid ones (both completed and in-progress)
  // IMPORTANT: Keep ALL records - both with check_out_time (completed) and without (in-progress)
  const validHistory = (attendanceHistory || []).filter(
    (item) => item && item.id && item.check_in_time
  );

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: theme.colors.background}]} edges={['top']}>
      <FlatList
        data={validHistory}
        renderItem={renderAttendance}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={[styles.listContent, isWideWeb && styles.webListContent]}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="history" size={64} color={theme.colors.onSurfaceVariant} />
            <Text variant="bodyLarge" style={styles.emptyText}>
              No attendance history
            </Text>
            <Text variant="bodySmall" style={styles.emptyText}>
              Check in to start recording your attendance
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    paddingBottom: 20,
  },
  webListContent: {
    width: '100%',
    maxWidth: 1080,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  attendanceCard: {
    marginBottom: 12,
  },
  attendanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  attendanceInfo: {
    flex: 1,
    marginLeft: 12,
  },
  siteName: {
    fontWeight: '600',
    marginBottom: 4,
  },
  date: {
    opacity: 0.7,
  },
  attendanceDetails: {
    marginTop: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailText: {
    marginLeft: 8,
    opacity: 0.8,
  },
  durationChip: {
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  durationChipText: {
    fontSize: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    marginTop: 16,
    opacity: 0.6,
  },
});
