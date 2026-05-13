import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';

export function LoginScreen() {
  const router = useRouter();
  const { signInAdmin, signInEmployee } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [role, setRole] = useState<'employee' | 'admin'>(
    Platform.OS === 'web' ? 'admin' : 'employee',
  );

  const isWeb = Platform.OS === 'web';

  const onSubmit = async () => {
    if (!identifier.trim() || !password) {
      setErrorMessage(
        role === 'employee'
          ? 'Employee ID/email and password are required.'
          : 'Admin email and password are required.',
      );
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      if (role === 'admin') {
        await signInAdmin({
          email: identifier.trim(),
          password,
        });
      } else {
        await signInEmployee({
          identifier: identifier.trim(),
          password,
        });
      }
      router.replace('/(protected)');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to login right now.';
      setErrorMessage(message);
      Alert.alert('Login failed', message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <View style={styles.card}>
        <Text style={styles.title}>CrewTrack Login</Text>
        <Text style={styles.subtitle}>
          {role === 'employee'
            ? 'Sign in from your registered Android work device.'
            : 'Admin sign in for web or mobile.'}
        </Text>

        <View style={styles.roleRow}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setRole('employee')}
            style={[
              styles.roleButton,
              role === 'employee' && styles.roleButtonActive,
            ]}
          >
            <Text
              style={[
                styles.roleLabel,
                role === 'employee' && styles.roleLabelActive,
              ]}
            >
              Employee
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setRole('admin')}
            style={[styles.roleButton, role === 'admin' && styles.roleButtonActive]}
          >
            <Text
              style={[
                styles.roleLabel,
                role === 'admin' && styles.roleLabelActive,
              ]}
            >
              Admin
            </Text>
          </Pressable>
        </View>

        {isWeb && role === 'employee' ? (
          <Text style={styles.warning}>
            Employee login requires Android device binding and is unavailable on web.
          </Text>
        ) : null}

        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={role === 'employee' ? 'Employee ID or email' : 'Admin email'}
          value={identifier}
          onChangeText={setIdentifier}
          style={styles.input}
        />

        <TextInput
          placeholder="Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          style={styles.input}
        />

        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

        <Pressable
          accessibilityRole="button"
          disabled={submitting}
          onPress={onSubmit}
          style={({ pressed }) => [
            styles.button,
            submitting && styles.buttonDisabled,
            pressed && !submitting && styles.buttonPressed,
          ]}
        >
          <Text style={styles.buttonLabel}>
            {submitting ? 'Signing in...' : 'Sign in'}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#0f172a',
  },
  card: {
    borderRadius: 16,
    backgroundColor: '#ffffff',
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 15,
    color: '#475569',
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  warning: {
    color: '#92400e',
    fontSize: 13,
    marginTop: -6,
  },
  roleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  roleButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  roleButtonActive: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  roleLabel: {
    color: '#0f172a',
    fontWeight: '600',
  },
  roleLabelActive: {
    color: '#ffffff',
  },
  error: {
    color: '#b91c1c',
    fontSize: 14,
  },
  button: {
    backgroundColor: '#7f1d1d',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  buttonPressed: {
    opacity: 0.9,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonLabel: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
