import React from 'react';
import {View, StyleSheet, ScrollView} from 'react-native';
import {Text, Card, Button, useTheme} from 'react-native-paper';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useQuery} from '@tanstack/react-query';
import {employeeApi} from '../../services/api';
import {useAuth} from '../../hooks/useAuth';
import {LoadingSpinner} from '../../components/common/LoadingSpinner';
import {Avatar} from '../../components/common/Avatar';
import {formatEmployeeName} from '../../utils/format';
import {colors} from '../../theme/colors';
import {useNavigation} from '@react-navigation/native';
import {MaterialCommunityIcons as Icon} from '@expo/vector-icons';

export const ProfileScreen: React.FC = () => {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const {currentUser, logout} = useAuth();
  const employeeId = currentUser?.id || 0;

  // Always call hooks before any conditional returns
  const {data: employee, isLoading} = useQuery({
    queryKey: ['employee', 'profile', employeeId],
    queryFn: async () => {
      const response = await employeeApi.getProfile(employeeId);
      if (response.success && response.data) {
        return response.data;
      }
      // Fallback to currentUser data if API fails
      if (currentUser) {
        return {
          id: currentUser.id,
          first_name: currentUser.name.split(' ')[0] || '',
          last_name: currentUser.name.split(' ').slice(1).join(' ') || '',
          email: currentUser.email,
          employee_id: '',
          phone: '',
          address: '',
          admin_id: 0,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }
      throw new Error(response.error || 'Failed to load profile');
    },
    enabled: !!employeeId && !!currentUser,
  });

  // If no current user, show loading (will redirect to login)
  if (!currentUser) {
    return <LoadingSpinner />;
  }

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!employee) {
    return (
      <View style={[styles.container, {backgroundColor: theme.colors.background}]}>
        <View style={styles.errorContainer}>
          <Text variant="bodyLarge" style={styles.errorText}>
            Profile not found
          </Text>
          <Button
            mode="contained"
            onPress={() => logout()}
            style={styles.logoutButton}
            buttonColor={colors.deepBurgundy}>
            Logout
          </Button>
        </View>
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
            <View style={styles.sectionHeader}>
              <Text variant="titleMedium" style={styles.sectionTitle}>
                Personal Information
              </Text>
              <Button
                mode="text"
                onPress={() => navigation.navigate('EditEmployeeProfile')}
                icon="pencil"
                textColor={colors.deepBurgundy}
                compact>
                Edit
              </Button>
            </View>
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
            {employee.phone && (
              <View style={styles.infoRow}>
                <Text variant="bodyMedium" style={styles.label}>
                  Phone:
                </Text>
                <Text variant="bodyMedium">{employee.phone}</Text>
              </View>
            )}
            {employee.address && (
              <View style={styles.infoRow}>
                <Text variant="bodyMedium" style={styles.label}>
                  Address:
                </Text>
                <Text variant="bodyMedium" style={styles.addressText}>
                  {employee.address}
                </Text>
              </View>
            )}
          </Card.Content>
        </Card>

        <Button
          mode="contained"
          onPress={() => logout()}
          style={styles.logoutButton}
          buttonColor={colors.deepBurgundy}>
          Logout
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
    paddingBottom: 20,
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
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
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
  addressText: {
    flex: 1,
    textAlign: 'right',
  },
  logoutButton: {
    marginTop: 16,
    marginBottom: 8,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    marginBottom: 20,
    textAlign: 'center',
  },
});

