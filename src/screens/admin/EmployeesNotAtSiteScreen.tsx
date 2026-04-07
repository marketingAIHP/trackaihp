import React from 'react';
import {View, StyleSheet, FlatList, RefreshControl} from 'react-native';
import {Text, Card, useTheme, Chip} from 'react-native-paper';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useQuery} from '@tanstack/react-query';
import {adminApi} from '../../services/api';
import {useAuth} from '../../hooks/useAuth';
import {LoadingSpinner} from '../../components/common/LoadingSpinner';
import {Avatar} from '../../components/common/Avatar';
import {Attendance} from '../../types';
import {formatEmployeeName, formatDistance, formatTime} from '../../utils/format';
import {MaterialCommunityIcons as Icon} from '@expo/vector-icons';
import {useNavigation} from '@react-navigation/native';
import {colors} from '../../theme/colors';
import {checkGeofence} from '../../utils/geofence';

export const EmployeesNotAtSiteScreen: React.FC = () => {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const {currentUser} = useAuth();
  const adminId = currentUser?.id || 0;

  const {data: employeesNotAtSite, isLoading, refetch, isRefetching} = useQuery({
    queryKey: ['admin', 'employeesNotAtSite', adminId],
    queryFn: async () => {
      const response = await adminApi.getEmployeesNotAtSite(adminId);
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.error || 'Failed to load alerts');
    },
    enabled: !!adminId,
  });

  if (isLoading) {
    return <LoadingSpinner />;
  }

  const renderEmployee = ({item}: {item: Attendance}) => {
    const employee = item.employee;
    const assignedSite = employee?.site;
    
    if (!employee || !assignedSite) return null;

    // Calculate distance from check-in location to assigned site
    let distance = 0;
    let distanceText = 'Unknown';
    
    if (item.check_in_latitude && item.check_in_longitude && assignedSite) {
      const checkInLocation = {
        latitude: item.check_in_latitude,
        longitude: item.check_in_longitude,
      };
      
      const geofenceStatus = checkGeofence(checkInLocation, assignedSite);
      distance = geofenceStatus.distance;
      distanceText = formatDistance(distance);
    }

    return (
      <Card
        style={[styles.employeeCard, styles.alertCard]}
        onPress={() => navigation.navigate('EmployeeProfile', {employeeId: employee.id})}>
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
              <View style={styles.siteInfo}>
                <View style={styles.siteRow}>
                  <Icon name="map-marker" size={16} color={colors.danger[600]} />
                  <Text variant="bodySmall" style={styles.assignedSite}>
                    Assigned Site: {assignedSite.name}
                  </Text>
                </View>
                <View style={styles.siteRow}>
                  <Icon name="alert-circle" size={16} color={colors.warning[600]} />
                  <Text variant="bodySmall" style={styles.distanceText}>
                    Outside boundary: {distanceText} away
                  </Text>
                </View>
              </View>
              <Text variant="bodySmall" style={styles.checkInTime}>
                Checked in: {formatTime(item.check_in_time)}
              </Text>
            </View>
            <View style={styles.statusIndicator}>
              <Icon name="alert" size={24} color={colors.danger[600]} />
            </View>
          </View>
        </Card.Content>
      </Card>
    );
  };

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: theme.colors.background}]} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Icon name="alert" size={28} color={colors.danger[600]} />
          <Text variant="headlineSmall" style={styles.title}>
            Employees Not At Site
          </Text>
        </View>
        <Text variant="bodyMedium" style={styles.subtitle}>
          {employeesNotAtSite?.length || 0} employee{employeesNotAtSite?.length !== 1 ? 's' : ''} checked in but outside the site geofence boundary
        </Text>
      </View>

      <FlatList
        data={employeesNotAtSite || []}
        renderItem={renderEmployee}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="check-circle" size={64} color={colors.success[600]} />
            <Text variant="bodyLarge" style={styles.emptyText}>
              All employees are within their site boundaries
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
  header: {
    padding: 16,
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  title: {
    fontWeight: 'bold',
  },
  subtitle: {
    opacity: 0.7,
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
  },
  employeeCard: {
    marginBottom: 12,
  },
  alertCard: {
    borderLeftWidth: 4,
    borderLeftColor: colors.danger[600],
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
    marginBottom: 8,
  },
  siteInfo: {
    marginBottom: 8,
    gap: 4,
  },
  siteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  assignedSite: {
    opacity: 0.8,
  },
  distanceText: {
    opacity: 0.7,
    color: colors.warning[600],
    fontWeight: '600',
  },
  checkInTime: {
    opacity: 0.6,
    fontSize: 12,
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
    textAlign: 'center',
  },
});
