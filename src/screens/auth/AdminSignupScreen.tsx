import React, {useState} from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import {TextInput, Text, useTheme} from 'react-native-paper';
import {useForm, Controller} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {adminSignupSchema, AdminSignupFormData} from '../../utils/validation';
import {Button} from '../../components/common/Button';
import {authApi} from '../../services/api';
import {LinearGradient} from 'expo-linear-gradient';
import {colors} from '../../theme/colors';

export const AdminSignupScreen: React.FC<{navigation: any}> = ({navigation}) => {
  const theme = useTheme();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    control,
    handleSubmit,
    formState: {errors, isSubmitting},
  } = useForm<AdminSignupFormData>({
    resolver: zodResolver(adminSignupSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      company_name: '',
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: AdminSignupFormData) => {
    setError(null);
    const response = await authApi.adminSignup(data);
    if (response.success) {
      setSuccess(true);
      setTimeout(() => {
        navigation.navigate('AdminLogin');
      }, 2000);
    } else {
      setError(response.error || 'Signup failed');
    }
  };

  if (success) {
    return (
      <LinearGradient
        colors={[colors.slate[900], colors.slate[800]]}
        style={styles.container}>
        <View style={styles.successContainer}>
          <Text variant="headlineSmall" style={styles.successText}>
            Account created successfully!
          </Text>
          <Text variant="bodyMedium" style={styles.successSubtext}>
            Please check your email for verification.
          </Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={[colors.slate[900], colors.slate[800]]}
      style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled">
          <View style={styles.content}>
            <View style={[styles.card, {backgroundColor: theme.colors.surface}]}>
              <Text variant="headlineSmall" style={styles.title}>
                Admin Signup
              </Text>

              <Controller
                control={control}
                name="first_name"
                render={({field: {onChange, onBlur, value}}) => (
                  <TextInput
                    label="First Name"
                    value={value}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    mode="outlined"
                    error={!!errors.first_name}
                    style={styles.input}
                  />
                )}
              />
              {errors.first_name && (
                <Text style={styles.errorText}>{errors.first_name.message}</Text>
              )}

              <Controller
                control={control}
                name="last_name"
                render={({field: {onChange, onBlur, value}}) => (
                  <TextInput
                    label="Last Name"
                    value={value}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    mode="outlined"
                    error={!!errors.last_name}
                    style={styles.input}
                  />
                )}
              />
              {errors.last_name && (
                <Text style={styles.errorText}>{errors.last_name.message}</Text>
              )}

              <Controller
                control={control}
                name="company_name"
                render={({field: {onChange, onBlur, value}}) => (
                  <TextInput
                    label="Company Name"
                    value={value}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    mode="outlined"
                    error={!!errors.company_name}
                    style={styles.input}
                  />
                )}
              />
              {errors.company_name && (
                <Text style={styles.errorText}>
                  {errors.company_name.message}
                </Text>
              )}

              <Controller
                control={control}
                name="email"
                render={({field: {onChange, onBlur, value}}) => (
                  <TextInput
                    label="Email"
                    value={value}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    mode="outlined"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    error={!!errors.email}
                    style={styles.input}
                  />
                )}
              />
              {errors.email && (
                <Text style={styles.errorText}>{errors.email.message}</Text>
              )}

              <Controller
                control={control}
                name="password"
                render={({field: {onChange, onBlur, value}}) => (
                  <TextInput
                    label="Password"
                    value={value}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    mode="outlined"
                    secureTextEntry={!showPassword}
                    right={
                      <TextInput.Icon
                        icon={showPassword ? 'eye-off' : 'eye'}
                        onPress={() => setShowPassword(!showPassword)}
                      />
                    }
                    error={!!errors.password}
                    style={styles.input}
                  />
                )}
              />
              {errors.password && (
                <Text style={styles.errorText}>{errors.password.message}</Text>
              )}

              {error && <Text style={styles.errorText}>{error}</Text>}

              <Button
                mode="contained"
                onPress={handleSubmit(onSubmit)}
                loading={isSubmitting}
                disabled={isSubmitting}
                style={styles.button}>
                Sign Up
              </Button>

              <View style={styles.footer}>
                <Text variant="bodyMedium">Already have an account? </Text>
                <Text
                  variant="bodyMedium"
                  style={styles.link}
                  onPress={() => navigation.navigate('AdminLogin')}>
                  Login
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  card: {
    padding: 24,
    borderRadius: 16,
    elevation: 4,
  },
  title: {
    marginBottom: 24,
    textAlign: 'center',
  },
  input: {
    marginBottom: 8,
  },
  errorText: {
    color: colors.danger[600],
    fontSize: 12,
    marginBottom: 8,
    marginLeft: 12,
  },
  button: {
    marginTop: 16,
    marginBottom: 16,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  link: {
    color: colors.primary[600],
    fontWeight: '600',
  },
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  successText: {
    color: colors.white,
    textAlign: 'center',
    marginBottom: 16,
  },
  successSubtext: {
    color: colors.slate[300],
    textAlign: 'center',
  },
});

