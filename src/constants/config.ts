import {Platform} from 'react-native';
import Constants from 'expo-constants';

// Supabase Configuration - Read from Expo extra config or environment
// In Expo, these come from app.config.js extra field or .env file
export const getConfigValue = (key: string, defaultValue: string = ''): string => {
  // Try Expo extra config first (works in Expo Go)
  const expoValue = Constants.expoConfig?.extra?.[key];
  if (expoValue && expoValue !== '' && expoValue !== defaultValue) {
    return expoValue as string;
  }
  
  // Fallback to process.env (for .env file in development)
  const envValue = typeof process !== 'undefined' ? process.env?.[key] : undefined;
  if (envValue && envValue !== '' && envValue !== defaultValue) {
    return envValue as string;
  }
  
  return defaultValue;
};

export const SUPABASE_URL = getConfigValue('supabaseUrl', 'https://placeholder.supabase.co');
export const SUPABASE_ANON_KEY = getConfigValue('supabaseAnonKey', 'placeholder-key');
export const GOOGLE_MAPS_API_KEY = getConfigValue('googleMapsApiKey', '');

// API Configuration
export const API_BASE_URL = SUPABASE_URL || '';

// App Configuration
export const APP_NAME = 'AIHP CrewTrack';
export const APP_VERSION = '1.0.0';

// Environment
export const IS_PRODUCTION = !__DEV__;
export const IS_DEVELOPMENT = __DEV__;

// GPS Configuration
export const GPS_UPDATE_INTERVAL = 30000; // 30 seconds
export const GPS_ACCURACY_BUFFER = 15; // 15 meters buffer for GPS accuracy tolerance only
export const DEFAULT_GEOFENCE_RADIUS = 200; // meters

// Production optimizations
export const QUERY_STALE_TIME = IS_PRODUCTION ? 5 * 60 * 1000 : 0; // 5 minutes in prod, 0 in dev
export const QUERY_CACHE_TIME = 10 * 60 * 1000; // 10 minutes

// Image Configuration
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
export const IMAGE_COMPRESSION_QUALITY = 0.8;

// Storage Buckets
export const STORAGE_BUCKETS = {
  PROFILE_IMAGES: 'profile-images',
  SITE_IMAGES: 'site-images',
} as const;

// Notification Types
export const NOTIFICATION_TYPES = {
  CHECKIN: 'checkin',
  CHECKOUT: 'checkout',
  ALERT: 'alert',
  SYSTEM: 'system',
} as const;

// User Roles
export const USER_ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  EMPLOYEE: 'employee',
} as const;

// Platform
export const IS_IOS = Platform.OS === 'ios';
export const IS_ANDROID = Platform.OS === 'android';
