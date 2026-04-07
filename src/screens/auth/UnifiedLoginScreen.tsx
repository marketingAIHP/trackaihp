import React, {useState} from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import {TextInput, Text, useTheme} from 'react-native-paper';
import {useForm, Controller} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {loginSchema, LoginFormData} from '../../utils/validation';
import {Button} from '../../components/common/Button';
import {useAuth} from '../../hooks/useAuth';
import {LinearGradient} from 'expo-linear-gradient';
import {colors} from '../../theme/colors';

export const UnifiedLoginScreen: React.FC<{navigation: any}> = ({navigation}) => {
  const theme = useTheme();
  const {unifiedLoginAsync, loginError, isLoggingIn} = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

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
      await unifiedLoginAsync({email: data.email, password: data.password});
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
      colors={[colors.navyInk, colors.navyGrey]}
      style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled">
          <View style={styles.content}>
            {/* Logo */}
            <View style={styles.logoContainer}>
              <Text style={styles.logoText}>
                <Text style={styles.logoPart}>A</Text>
                <Text style={[styles.logoPart, styles.redI]}>I</Text>
                <Text style={styles.logoPart}>HP</Text>
                <Text style={styles.logoPart}> </Text>
                <Text style={[styles.logoPart, styles.crewtrackText]}>CrewTrack</Text>
              </Text>
            </View>

            {/* Login Card */}
            <View style={[styles.card, {backgroundColor: theme.colors.surface}]}>
              <Text variant="headlineSmall" style={styles.title}>
                Login
              </Text>
              <Text variant="bodySmall" style={styles.subtitleText}>
                Enter your credentials to access your account
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
                style={styles.button}
                buttonColor={colors.deepBurgundy}>
                {isLoggingIn ? 'Logging in...' : 'Login'}
              </Button>
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
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
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
  redI: {
    color: colors.danger[600],
    fontWeight: 'bold',
  },
  crewtrackText: {
    fontSize: 44,
    fontWeight: '900',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: {width: 0, height: 2},
    textShadowRadius: 6,
  },
  subtitleText: {
    color: colors.coolGrey,
    textAlign: 'center',
    marginBottom: 24,
  },
  card: {
    padding: 24,
    borderRadius: 16,
    elevation: 4,
  },
  title: {
    marginBottom: 8,
    textAlign: 'center',
    color: colors.navyInk,
    fontWeight: 'bold',
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
    flexWrap: 'wrap',
  },
  link: {
    color: colors.deepBurgundy,
    fontWeight: '600',
  },
});

