import {env, envMessages} from '../config/env';

/**
 * Validates that required environment variables are set
 * @returns Object with isValid flag and array of missing variables
 */
export function validateEnvironment(): {
  isValid: boolean;
  missing: string[];
  warnings: string[];
  message?: string;
} {
  const missing = [...env.missingRequiredKeys];
  const warnings: string[] = [];

  // Optional but recommended
  // Add warnings for missing optional configs if needed

  return {
    isValid: missing.length === 0,
    missing,
    warnings,
    message:
      missing.length > 0
        ? `${envMessages.missingSupabase} Missing keys: ${missing.join(', ')}`
        : undefined,
  };
}

/**
 * Checks if app is running in production mode
 */
export function isProduction(): boolean {
  return __DEV__ === false;
}

/**
 * Checks if app is running in development mode
 */
export function isDevelopment(): boolean {
  return __DEV__ === true;
}

