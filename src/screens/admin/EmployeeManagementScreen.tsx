import React, {useState} from 'react';
import {View, StyleSheet, FlatList, RefreshControl} from 'react-native';
import {Text, Card, FAB, Searchbar, useTheme} from 'react-native-paper';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useQuery} from '@tanstack/react-query';
import {adminApi} from '../../services/api';
import {useAuth} from '../../hooks/useAuth';
import {LoadingSpinner} from '../../components/common/LoadingSpinner';
import {Avatar} from '../../components/common/Avatar';
import {Employee} from '../../types';
import {formatEmployeeName} from '../../utils/format';
import {MaterialCommunityIcons as Icon} from '@expo/vector-icons';
import {colors} from '../../theme/colors';

export const EmployeeManagementScreen: React.FC<{navigation: any}> = ({
  navigation,
}) => {
  const theme = useTheme();
  const {currentUser} = useAuth();
  const adminId = currentUser?.id || 0;
  const [searchQuery, setSearchQuery] = useState('');

  const {data: employees, isLoading, refetch, isRefetching} = useQuery({
    queryKey: ['admin', 'employees', adminId],
    queryFn: async () => {
      const response = await adminApi.getEmployees(adminId);
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.error || 'Failed to load employees');
    },
    enabled: !!adminId,
  });

  const filteredEmployees = employees?.filter((emp) => {
    const query = searchQuery.toLowerCase();
    return (
      emp.first_name.toLowerCase().includes(query) ||
      emp.last_name.toLowerCase().includes(query) ||
      emp.email.toLowerCase().includes(query) ||
      emp.employee_id?.toLowerCase().includes(query)
    );
  });

  if (isLoading) {
    return <LoadingSpinner />;
  }

  const renderEmployee = ({item}: {item: Employee}) => (
    <Card
      style={styles.employeeCard}
      onPress={() => navigation.navigate('EmployeeProfile', {employeeId: item.id})}>
      <Card.Content>
        <View style={styles.employeeRow}>
          <Avatar
            imageUri={item.profile_image}
            firstName={item.first_name}
            lastName={item.last_name}
            size={56}
          />
          <View style={styles.employeeInfo}>
            <Text variant="titleMedium" style={styles.employeeName}>
              {formatEmployeeName(item.first_name, item.last_name)}
            </Text>
            <Text variant="bodySmall" style={styles.siteName}>
              {item.remote_work 
                ? 'Remote Work' 
                : item.site 
                  ? item.site.name 
                  : 'No Site Assigned'}
            </Text>
          </View>
          <View style={styles.statusIndicator}>
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor: item.is_active
                    ? colors.success[600]
                    : colors.danger[600],
                },
              ]}
            />
          </View>
        </View>
      </Card.Content>
    </Card>
  );

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: theme.colors.background}]} edges={['top']}>
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search employees..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchbar}
        />
      </View>

      <FlatList
        data={filteredEmployees || []}
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
              No employees found
            </Text>
          </View>
        }
      />

      <FAB
        icon="plus"
        style={[styles.fab, {backgroundColor: colors.deepBurgundy}]}
        color={colors.pureWhite}
        onPress={() => {
          navigation.navigate('CreateEmployee');
        }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    padding: 16,
  },
  searchbar: {
    elevation: 2,
  },
  listContent: {
    padding: 16,
    paddingBottom: 100, // Extra padding for FAB and tab bar
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
    opacity: 0.7,
    marginTop: 4,
  },
  statusIndicator: {
    marginLeft: 8,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 80, // Position above tab bar
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

