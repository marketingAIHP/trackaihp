import React, {useState} from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  useWindowDimensions,
} from 'react-native';
import {TextInput, Text, useTheme} from 'react-native-paper';
import {useForm, Controller} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {loginSchema, LoginFormData} from '../../utils/validation';
import {Button} from '../../components/common/Button';
import {useAuth} from '../../hooks/useAuth';
import {LinearGradient} from 'expo-linear-gradient';
import {colors} from '../../theme/colors';

export const EmployeeLoginScreen: React.FC<{navigation: any}> = ({navigation}) => {
  const theme = useTheme();
  const {employeeLoginAsync, loginError, isLoggingIn} = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const {width} = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const isWideWeb = isWeb && width >= 768;

  const {
    control,
    handleSubmit,
    formState: {errors},
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
      rememberMe: false,
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setLocalError(null);
    try {
      await employeeLoginAsync({email: data.email, password: data.password});
    } catch (error: any) {
      const errorMsg = error?.message || 'Login failed. Please try again.';
      setLocalError(errorMsg);
      Alert.alert('Login Failed', errorMsg);
    }
  };

  // Get error message to display
  const displayError = localError || (loginError as any)?.message;

  return (
    <LinearGradient
      colors={[colors.slate[900], colors.slate[800]]}
      style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            isWideWeb && styles.webScrollContent,
          ]}
          keyboardShouldPersistTaps="handled">
          <View style={[styles.content, isWideWeb && styles.webContent]}>
            <View style={[styles.logoContainer, isWideWeb && styles.webLogoContainer]}>
              <Text style={styles.logoText}>
                <Text style={styles.logoPart}>A</Text>
                <Text style={[styles.logoPart, styles.redI]}>I</Text>
                <Text style={styles.logoPart}>HP</Text>
                <Text style={styles.logoPart}> </Text>
                <Text style={[styles.logoPart, styles.crewtrackText]}>CrewTrack</Text>
              </Text>
            </View>

            <View style={[styles.card, {backgroundColor: theme.colors.surface}, isWideWeb && styles.webCard]}>
              <Text variant="headlineSmall" style={styles.title}>
                Employee Login
              </Text>

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

              {displayError && (
                <Text style={styles.errorText}>
                  {displayError}
                </Text>
              )}

              <Button
                mode="contained"
                onPress={handleSubmit(onSubmit)}
                loading={isLoggingIn}
                disabled={isLoggingIn}
                style={styles.button}>
                {isLoggingIn ? 'Logging in...' : 'Login'}
              </Button>

              <View style={styles.footer}>
                <Text variant="bodyMedium">Admin? </Text>
                <Text
                  variant="bodyMedium"
                  style={[styles.link, isWeb && styles.webLink]}
                  onPress={() => navigation.navigate('AdminLogin')}>
                  Switch to Admin Login
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
  webScrollContent: {
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  webContent: {
    maxWidth: 1120,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 32,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  webLogoContainer: {
    flex: 1,
    marginBottom: 0,
    alignItems: 'flex-start',
    paddingRight: 16,
  },
  logoText: {
    fontSize: 40,
    fontWeight: 'bold',
    color: colors.pureWhite,
    textAlign: 'center',
  },
  logoPart: {
    fontSize: 40,
    fontWeight: 'bold',
    color: colors.pureWhite,
  },
  crewtrackText: {
    fontSize: 44,
    fontWeight: '900',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: {width: 0, height: 2},
    textShadowRadius: 6,
  },
  redI: {
    color: colors.danger[600],
    fontWeight: 'bold',
  },
  card: {
    padding: 24,
    borderRadius: 16,
    elevation: 4,
  },
  webCard: {
    flex: 1,
    maxWidth: 460,
    width: '100%',
    padding: 32,
    alignSelf: 'stretch',
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
    marginTop: 8,
  },
  link: {
    color: colors.deepBurgundy,
    fontWeight: '600',
  },
  webLink: {
    cursor: 'pointer',
  },
});

