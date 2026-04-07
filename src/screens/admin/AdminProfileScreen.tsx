import React from 'react';
import {View, StyleSheet, ScrollView} from 'react-native';
import {Text, Card, Button, useTheme} from 'react-native-paper';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useQuery} from '@tanstack/react-query';
import {adminApi} from '../../services/api';
import {useAuth} from '../../hooks/useAuth';
import {LoadingSpinner} from '../../components/common/LoadingSpinner';
import {Avatar} from '../../components/common/Avatar';
import {colors} from '../../theme/colors';
import {useNavigation} from '@react-navigation/native';

export const AdminProfileScreen: React.FC = () => {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const {currentUser, logout} = useAuth();
  const adminId = currentUser?.id || 0;

  // Always call hooks before any conditional returns
  const {data: admin, isLoading} = useQuery({
    queryKey: ['admin', 'profile', adminId],
    queryFn: async () => {
      const response = await adminApi.getProfile(adminId);
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
          company_name: '',
          role: 'admin' as const,
          is_verified: true,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }
      throw new Error(response.error || 'Failed to load profile');
    },
    enabled: !!adminId && !!currentUser,
  });

  // If no current user, show loading (will redirect to login)
  if (!currentUser) {
    return <LoadingSpinner />;
  }

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!admin) {
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
              imageUri={admin.profile_image}
              firstName={admin.first_name}
              lastName={admin.last_name}
              size={100}
            />
            <Text variant="headlineSmall" style={styles.name}>
              {admin.first_name} {admin.last_name}
            </Text>
            <Text variant="bodyMedium" style={styles.email}>
              {admin.email}
            </Text>
            <Text variant="bodySmall" style={styles.company}>
              {admin.company_name}
            </Text>
          </Card.Content>
        </Card>

        <Card style={styles.infoCard}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Account Information
            </Text>
            <View style={styles.infoRow}>
              <Text variant="bodyMedium" style={styles.label}>
                Role:
              </Text>
              <Text variant="bodyMedium">{admin.role}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text variant="bodyMedium" style={styles.label}>
                Status:
              </Text>
              <Text variant="bodyMedium">
                {admin.is_active ? 'Active' : 'Inactive'}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text variant="bodyMedium" style={styles.label}>
                Verified:
              </Text>
              <Text variant="bodyMedium">
                {admin.is_verified ? 'Yes' : 'No'}
              </Text>
            </View>
          </Card.Content>
        </Card>

        <Button
          mode="contained"
          onPress={() => navigation.navigate('EditAdminProfile')}
          style={styles.editButton}
          icon="pencil"
          buttonColor={colors.mutedTeal}>
          Edit Profile
        </Button>

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
    flexGrow: 1,
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
  email: {
    marginTop: 8,
    opacity: 0.7,
  },
  company: {
    marginTop: 4,
    opacity: 0.6,
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
    marginTop: 8,
    marginBottom: 8,
  },
  logoutButton: {
    marginTop: 8,
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

