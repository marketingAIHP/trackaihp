import React from 'react';
import {View, StyleSheet, FlatList, RefreshControl} from 'react-native';
import {Text, Card, useTheme, Chip, Button} from 'react-native-paper';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useQuery} from '@tanstack/react-query';
import {adminApi} from '../../services/api';
import {useAuth} from '../../hooks/useAuth';
import {LoadingSpinner} from '../../components/common/LoadingSpinner';
import {Avatar} from '../../components/common/Avatar';
import {Attendance} from '../../types';
import {formatEmployeeName, formatTime} from '../../utils/format';
import {MaterialCommunityIcons as Icon} from '@expo/vector-icons';
import {useNavigation} from '@react-navigation/native';
import {colors} from '../../theme/colors';

export const OnSiteEmployeesScreen: React.FC = () => {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const {currentUser} = useAuth();
  const adminId = currentUser?.id || 0;

  const {data: onSiteEmployees, isLoading, refetch, isRefetching} = useQuery({
    queryKey: ['admin', 'onSiteEmployees', adminId],
    queryFn: async () => {
      const response = await adminApi.getOnSiteEmployees(adminId);
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.error || 'Failed to load on-site employees');
    },
    enabled: !!adminId,
    staleTime: 30 * 1000, // 30 seconds fresh
    refetchInterval: 60 * 1000, // Poll every 60 seconds
  });

  if (isLoading) {
    return <LoadingSpinner />;
  }

  const renderEmployee = ({item}: {item: Attendance}) => {
    const employee = item.employee;
    const site = item.site;
    
    if (!employee) return null;

    return (
      <Card style={styles.employeeCard}>
        <Card.Content>
          <View style={styles.employeeRow}>
            <Avatar
              imageUri={employee.profile_image}
              firstName={employee.first_name}
              lastName={employee.last_name}
              size={56}
            />
            <View style={styles.employeeInfo}>
              <Text variant="titleMedium" style={styles.employeeName}>
                {formatEmployeeName(employee.first_name, employee.last_name)}
              </Text>
              {site && (
                <Text variant="bodySmall" style={styles.siteName}>
                  {site.name}
                </Text>
              )}
              <Text variant="bodySmall" style={styles.checkInTime}>
                Checked in: {formatTime(item.check_in_time)}
              </Text>
              <Button
                mode="contained"
                onPress={(e) => {
                  e.stopPropagation();
                  navigation.navigate('LiveTracking', {employeeId: employee.id});
                }}
                style={styles.employeeLiveTrackingButton}
                buttonColor={colors.deepBurgundy}
                icon="map"
                compact
                contentStyle={styles.employeeButtonContent}
                labelStyle={styles.employeeButtonLabel}>
                Live Tracking
              </Button>
            </View>
            <View style={styles.statusIndicator}>
              <Icon name="map-marker-check" size={24} color={colors.success[600]} />
            </View>
          </View>
        </Card.Content>
      </Card>
    );
  };

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: theme.colors.background}]} edges={['top']}>
      <View style={styles.header}>
        <Text variant="headlineSmall" style={styles.title}>
          On Site Employees
        </Text>
        <Text variant="bodyMedium" style={styles.subtitle}>
          {onSiteEmployees?.length || 0} employee{onSiteEmployees?.length !== 1 ? 's' : ''} currently on-site
        </Text>
      </View>

      <FlatList
        data={onSiteEmployees || []}
        renderItem={renderEmployee}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="account-off" size={64} color={theme.colors.onSurfaceVariant} />
            <Text variant="bodyLarge" style={styles.emptyText}>
              No employees currently on-site
            </Text>
            <Button
              mode="contained"
              onPress={() => navigation.navigate('LiveTracking')}
              style={styles.emptyStateButton}
              buttonColor={colors.deepBurgundy}
              icon="map"
              contentStyle={styles.employeeButtonContent}
              labelStyle={styles.employeeButtonLabel}>
              View Live Tracking
            </Button>
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
  header: {
    padding: 16,
    paddingBottom: 12,
  },
  title: {
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subtitle: {
    opacity: 0.7,
  },
  emptyStateButton: {
    marginTop: 24,
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
  },
  employeeCard: {
    marginBottom: 12,
  },
  employeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  employeeInfo: {
    flex: 1,
    marginLeft: 12,
  },
  employeeName: {
    fontWeight: '600',
    marginBottom: 4,
  },
  siteName: {
    opacity: 0.85,
    marginBottom: 4,
    fontWeight: '500',
  },
  checkInTime: {
    opacity: 0.8,
    fontSize: 12,
    marginBottom: 8,
    fontWeight: '500',
  },
  employeeLiveTrackingButton: {
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  employeeButtonContent: {
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  employeeButtonLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusIndicator: {
    marginLeft: 8,
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

