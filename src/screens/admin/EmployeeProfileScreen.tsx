import React from 'react';
import {View, StyleSheet, ScrollView} from 'react-native';
import {Text, Card, Button, useTheme} from 'react-native-paper';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useQuery} from '@tanstack/react-query';
import {adminApi} from '../../services/api';
import {LoadingSpinner} from '../../components/common/LoadingSpinner';
import {Avatar} from '../../components/common/Avatar';
import {formatEmployeeName} from '../../utils/format';
import {useNavigation} from '@react-navigation/native';
import {colors} from '../../theme/colors';

export const EmployeeProfileScreen: React.FC<{route: any}> = ({route}) => {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const {employeeId} = route.params;

  const {data: employee, isLoading} = useQuery({
    queryKey: ['admin', 'employee', employeeId],
    queryFn: async () => {
      const response = await adminApi.getEmployee(employeeId);
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.error || 'Failed to load employee');
    },
  });

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!employee) {
    return (
      <View style={styles.container}>
        <Text>Employee not found</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: theme.colors.background}]} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
        <Card style={styles.profileCard}>
          <Card.Content style={styles.profileContent}>
            <Avatar
              imageUri={employee.profile_image}
              firstName={employee.first_name}
              lastName={employee.last_name}
              size={100}
            />
            <Text variant="headlineSmall" style={styles.name}>
              {formatEmployeeName(employee.first_name, employee.last_name)}
            </Text>
            <Text variant="bodyMedium" style={styles.site}>
              {employee.remote_work 
                ? 'Remote Work' 
                : employee.site 
                  ? employee.site.name 
                  : 'No Site Assigned'}
            </Text>
          </Card.Content>
        </Card>

        <Card style={styles.infoCard}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Employee Information
            </Text>
            <View style={styles.infoRow}>
              <Text variant="bodyMedium" style={styles.label}>
                Working Site:
              </Text>
              <Text variant="bodyMedium">
                {employee.remote_work 
                  ? 'Remote Work' 
                  : employee.site 
                    ? employee.site.name 
                    : 'N/A'}
              </Text>
            </View>
            {employee.department && (
              <View style={styles.infoRow}>
                <Text variant="bodyMedium" style={styles.label}>
                  Department:
                </Text>
                <Text variant="bodyMedium">{employee.department.name}</Text>
              </View>
            )}
            <View style={styles.infoRow}>
              <Text variant="bodyMedium" style={styles.label}>
                Status:
              </Text>
              <Text variant="bodyMedium">
                {employee.is_active ? 'Active' : 'Inactive'}
              </Text>
            </View>
          </Card.Content>
        </Card>

        <Button
          mode="contained"
          onPress={() => navigation.navigate('EditEmployee', {employeeId})}
          style={styles.editButton}
          icon="pencil"
          buttonColor={colors.mutedTeal}>
          Edit Employee
        </Button>
      </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  content: {
    padding: 16,
  },
  profileCard: {
    marginBottom: 16,
  },
  profileContent: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  name: {
    marginTop: 16,
    fontWeight: 'bold',
  },
  site: {
    marginTop: 8,
    opacity: 0.7,
  },
  infoCard: {
    marginBottom: 16,
  },
  sectionTitle: {
    marginBottom: 16,
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  label: {
    fontWeight: '600',
    opacity: 0.7,
  },
  editButton: {
    marginTop: 16,
  },
});

