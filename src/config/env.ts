import Constants from 'expo-constants';

const PLACEHOLDER_SUPABASE_URL = 'https://placeholder.supabase.co';
const PLACEHOLDER_SUPABASE_ANON_KEY = 'placeholder-key';

export const ENV_KEYS = {
  supabaseUrl: 'EXPO_PUBLIC_SUPABASE_URL',
  supabaseAnonKey: 'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  googleMapsApiKey: 'EXPO_PUBLIC_GOOGLE_MAPS_API_KEY',
} as const;

type EnvKey = (typeof ENV_KEYS)[keyof typeof ENV_KEYS];

type ExtraRecord = Record<string, unknown>;

function getExpoExtraSources(): Array<ExtraRecord | null | undefined> {
  const constantsWithLegacyManifest = Constants as typeof Constants & {
    expoGoConfig?: { extra?: ExtraRecord } | null;
    manifest?: { extra?: ExtraRecord } | null;
    manifest2?: {
      extra?: {
        expoClient?: { extra?: ExtraRecord };
        expoConfig?: { extra?: ExtraRecord };
      };
    } | null;
  };

  return [
    Constants.expoConfig?.extra,
    constantsWithLegacyManifest.expoGoConfig?.extra,
    constantsWithLegacyManifest.manifest?.extra,
    constantsWithLegacyManifest.manifest2?.extra?.expoClient?.extra,
    constantsWithLegacyManifest.manifest2?.extra?.expoConfig?.extra,
  ];
}

function normalizeEnvValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readExpoPublicEnv(key: EnvKey): string {
  const processEnvValue =
    typeof process !== 'undefined' && process.env ? process.env[key] : undefined;
  const normalizedProcessValue = normalizeEnvValue(processEnvValue);
  if (normalizedProcessValue) {
    return normalizedProcessValue;
  }

  for (const source of getExpoExtraSources()) {
    if (!source) continue;
    const normalizedExtraValue = normalizeEnvValue(source[key]);
    if (normalizedExtraValue) {
      return normalizedExtraValue;
    }
  }

  return '';
}

const supabaseUrl = readExpoPublicEnv(ENV_KEYS.supabaseUrl);
const supabaseAnonKey = readExpoPublicEnv(ENV_KEYS.supabaseAnonKey);
const googleMapsApiKey = readExpoPublicEnv(ENV_KEYS.googleMapsApiKey);

const missingRequiredKeys: EnvKey[] = [];
if (!supabaseUrl) {
  missingRequiredKeys.push(ENV_KEYS.supabaseUrl);
}
if (!supabaseAnonKey) {
  missingRequiredKeys.push(ENV_KEYS.supabaseAnonKey);
}

export const env = {
  supabaseUrl,
  supabaseAnonKey,
  googleMapsApiKey,
  missingRequiredKeys,
  isSupabaseConfigured:
    supabaseUrl.length > 0 &&
    supabaseUrl.startsWith('https://') &&
    supabaseUrl !== PLACEHOLDER_SUPABASE_URL &&
    supabaseAnonKey.length > 20 &&
    supabaseAnonKey !== PLACEHOLDER_SUPABASE_ANON_KEY,
} as const;

export const safeEnv = {
  supabaseUrl: env.isSupabaseConfigured ? env.supabaseUrl : PLACEHOLDER_SUPABASE_URL,
  supabaseAnonKey: env.isSupabaseConfigured
    ? env.supabaseAnonKey
    : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDUxOTIwMDAsImV4cCI6MTk2MDc2ODAwMH0.placeholder',
} as const;

export const envMessages = {
  missingSupabase:
    'Supabase configuration is missing. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY for web and EAS builds.',
} as const;
