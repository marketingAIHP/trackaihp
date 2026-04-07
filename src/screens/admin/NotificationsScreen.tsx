import React, {useEffect} from 'react';
import {View, StyleSheet, FlatList, RefreshControl} from 'react-native';
import {Text, Card, useTheme, Chip} from 'react-native-paper';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {adminApi} from '../../services/api';
import {useAuth} from '../../hooks/useAuth';
import {LoadingSpinner} from '../../components/common/LoadingSpinner';
import {Notification} from '../../types';
import {formatRelativeTime} from '../../utils/format';
import {MaterialCommunityIcons as Icon} from '@expo/vector-icons';
import {useFocusEffect} from '@react-navigation/native';
import {supabase} from '../../services/supabase';
import {Avatar} from '../../components/common/Avatar';

export const NotificationsScreen: React.FC = () => {
  const theme = useTheme();
  const {currentUser} = useAuth();
  const queryClient = useQueryClient();
  const adminId = currentUser?.id || 0;
  const [hasViewed, setHasViewed] = React.useState(false);

  const {data: notifications, isLoading, refetch, isRefetching} = useQuery({
    queryKey: ['admin', 'notifications', adminId],
    queryFn: async () => {
      const response = await adminApi.getNotifications(adminId);
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.error || 'Failed to load notifications');
    },
    enabled: !!adminId,
    staleTime: 0, // always treat as stale so refetch on mount
    refetchOnMount: 'always',
    refetchOnReconnect: true,
    refetchInterval: 60 * 1000, // Poll every 60 seconds (realtime handles immediate)
  });

  // Real-time subscription for immediate notification updates
  useEffect(() => {
    if (!adminId) return;

    const channel = supabase
      .channel(`notifications-screen:${adminId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `admin_id=eq.${adminId}` },
        () => {
          refetch();
          queryClient.invalidateQueries({queryKey: ['admin', 'notifications', 'unread', adminId]});
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [adminId, queryClient, refetch]);

  // Mark notifications as read when screen is focused (viewed)
  useFocusEffect(
    React.useCallback(() => {
      if (!adminId) {
        return;
      }

      // Always refetch fresh notifications when screen comes into focus
      refetch();

      if (notifications && notifications.length > 0) {
        // Optimistically clear unread badge so UI updates instantly
        queryClient.setQueryData(['admin', 'notifications', 'unread', adminId], 0);

        // Mark all notifications as read in backend
        adminApi.markAllNotificationsAsRead(adminId).then(() => {
          // Ensure unread count and list stay in sync
          queryClient.invalidateQueries({queryKey: ['admin', 'notifications', 'unread', adminId]});
          queryClient.invalidateQueries({queryKey: ['admin', 'notifications', adminId]});
        });
      }
    }, [adminId, notifications, queryClient, refetch])
  );

  if (isLoading) {
    return <LoadingSpinner />;
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'checkin':
        return 'clock-in';
      case 'checkout':
        return 'clock-out';
      case 'alert':
        return 'alert';
      default:
        return 'bell';
    }
  };

  const renderNotification = ({item}: {item: Notification}) => {
    const isCheckIn = item.type === 'checkin';
    const isCheckOut = item.type === 'checkout';

    return (
    <Card
      style={[
        styles.notificationCard,
        !item.is_read && {backgroundColor: theme.colors.primaryContainer},
      ]}>
      <Card.Content>
        <View style={styles.notificationHeader}>
            {item.employee ? (
              <Avatar
                imageUri={item.employee.profile_image}
                firstName={item.employee.first_name}
                lastName={item.employee.last_name}
                size={48}
              />
            ) : (
              <View style={[
                styles.iconContainer,
                isCheckIn && styles.checkInIconContainer,
                isCheckOut && styles.checkOutIconContainer,
              ]}>
          <Icon
            name={getNotificationIcon(item.type)}
            size={24}
                  color={isCheckIn ? '#10b981' : isCheckOut ? '#ef4444' : theme.colors.primary}
          />
              </View>
            )}
          <View style={styles.notificationContent}>
              <View style={styles.titleRow}>
            <Text variant="titleMedium" style={styles.notificationTitle}>
              {item.title}
            </Text>
                <Text variant="bodySmall" style={styles.timestamp}>
                  {formatRelativeTime(item.created_at)}
                </Text>
              </View>
            <Text variant="bodyMedium" style={styles.notificationMessage}>
              {item.message}
            </Text>
            <View style={styles.notificationFooter}>
              <Chip
                icon={getNotificationIcon(item.type)}
                  style={[
                    styles.typeChip,
                    isCheckIn && styles.checkInChip,
                    isCheckOut && styles.checkOutChip,
                  ]}
                  textStyle={[
                    styles.typeChipText,
                    isCheckIn && styles.checkInChipText,
                    isCheckOut && styles.checkOutChipText,
                  ]}>
                  {isCheckIn ? 'Checked In' : isCheckOut ? 'Checked Out' : item.type}
              </Chip>
            </View>
          </View>
        </View>
      </Card.Content>
    </Card>
  );
  };

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: theme.colors.background}]} edges={['top']}>
      <FlatList
        data={notifications || []}
        renderItem={renderNotification}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="bell-off" size={64} color={theme.colors.onSurfaceVariant} />
            <Text variant="bodyLarge" style={styles.emptyText}>
              No notifications
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
    paddingBottom: 40,
  },
  notificationCard: {
    marginBottom: 12,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkInIconContainer: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  checkOutIconContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  notificationContent: {
    flex: 1,
    marginLeft: 12,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  notificationTitle: {
    fontWeight: '700',
    fontSize: 16,
    flex: 1,
    marginRight: 8,
  },
  notificationMessage: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
    opacity: 0.9,
  },
  notificationFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  typeChip: {
    height: 28,
    paddingHorizontal: 8,
  },
  checkInChip: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  checkOutChip: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  typeChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  checkInChipText: {
    color: '#10b981',
  },
  checkOutChipText: {
    color: '#ef4444',
  },
  timestamp: {
    fontSize: 12,
    opacity: 0.75,
    fontWeight: '500',
    marginTop: 2,
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
