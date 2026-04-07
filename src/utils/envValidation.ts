import {SUPABASE_URL, SUPABASE_ANON_KEY} from '../constants/config';

/**
 * Validates that required environment variables are set
 * @returns Object with isValid flag and array of missing variables
 */
export function validateEnvironment(): {
  isValid: boolean;
  missing: string[];
  warnings: string[];
} {
  const missing: string[] = [];
  const warnings: string[] = [];

  // Required variables
  if (!SUPABASE_URL || SUPABASE_URL === 'https://placeholder.supabase.co') {
    missing.push('SUPABASE_URL');
  }

  if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY === 'placeholder-key') {
    missing.push('SUPABASE_ANON_KEY');
  }

  // Optional but recommended
  // Add warnings for missing optional configs if needed

  return {
    isValid: missing.length === 0,
    missing,
    warnings,
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

