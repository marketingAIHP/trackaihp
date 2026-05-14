import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { secureStoreAdapter } from './secure-store';

const extra = (Constants.expoConfig?.extra ??
  Constants.manifest2?.extra ??
  {}) as Record<string, string | undefined>;

export const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  extra.EXPO_PUBLIC_SUPABASE_URL ??
  extra.supabaseUrl;

export const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  extra.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  extra.supabaseAnonKey;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[device-auth] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY.',
  );
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
  auth: {
    storage: secureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
