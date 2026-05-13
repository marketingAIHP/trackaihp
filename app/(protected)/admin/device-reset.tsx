import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../../../hooks/useAuth';

export default function AdminDeviceResetRoute() {
  const { resetEmployeeDevice } = useAuth();
  const [employeeId, setEmployeeId] = useState('');
  const [reason, setReason] = useState('Phone replaced by admin.');
  const [submitting, setSubmitting] = useState(false);

  const onReset = async () => {
    const numericEmployeeId = Number(employeeId);
    if (!Number.isFinite(numericEmployeeId)) {
      Alert.alert('Invalid employee', 'Enter a numeric employee record ID.');
      return;
    }

    setSubmitting(true);
    try {
      await resetEmployeeDevice(numericEmployeeId, reason);
      Alert.alert(
        'Device reset complete',
        'The employee can bind a new Android device on their next successful login.',
      );
      setEmployeeId('');
    } catch (error) {
      Alert.alert(
        'Device reset failed',
        error instanceof Error ? error.message : 'Unexpected error',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Reset Employee Device</Text>
      <Text style={styles.caption}>
        This removes the current device binding and records an audit event.
      </Text>

      <TextInput
        keyboardType="number-pad"
        placeholder="Employee record ID"
        value={employeeId}
        onChangeText={setEmployeeId}
        style={styles.input}
      />

      <TextInput
        placeholder="Reason"
        value={reason}
        onChangeText={setReason}
        style={styles.input}
      />

      <Pressable
        accessibilityRole="button"
        disabled={submitting}
        onPress={onReset}
        style={styles.button}
      >
        <Text style={styles.buttonLabel}>
          {submitting ? 'Resetting...' : 'Reset device binding'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    gap: 16,
    backgroundColor: '#ffffff',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0f172a',
  },
  caption: {
    color: '#475569',
    fontSize: 15,
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  button: {
    borderRadius: 12,
    backgroundColor: '#7f1d1d',
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonLabel: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
