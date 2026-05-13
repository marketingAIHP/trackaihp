import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';

export default function ProtectedHomeRoute() {
  const router = useRouter();
  const { employee, admin, role, signOut } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Device-bound session active</Text>
      <Text style={styles.subtitle}>
        {role === 'employee'
          ? `Welcome ${employee?.fullName ?? employee?.email ?? 'Employee'}`
          : `Welcome ${admin?.fullName ?? admin?.email ?? 'Admin'}`}
      </Text>

      {role === 'admin' ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/(protected)/admin/device-reset')}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryLabel}>Reset employee device</Text>
        </Pressable>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => void signOut()}
        style={styles.primaryButton}
      >
        <Text style={styles.primaryLabel}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    gap: 16,
    backgroundColor: '#f8fafc',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 16,
    color: '#475569',
  },
  primaryButton: {
    borderRadius: 12,
    backgroundColor: '#0f172a',
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryLabel: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    borderRadius: 12,
    backgroundColor: '#e2e8f0',
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryLabel: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '600',
  },
});
