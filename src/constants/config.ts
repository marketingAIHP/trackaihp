import {Platform} from 'react-native';
import {env, ENV_KEYS} from '../config/env';

export const getConfigValue = (key: string, defaultValue: string = ''): string => {
  switch (key) {
    case 'googleMapsApiKey':
      return env.googleMapsApiKey || defaultValue;
    case 'supabaseUrl':
      return env.supabaseUrl || defaultValue;
    case 'supabaseAnonKey':
      return env.supabaseAnonKey || defaultValue;
    case ENV_KEYS.googleMapsApiKey:
      return env.googleMapsApiKey || defaultValue;
    case ENV_KEYS.supabaseUrl:
      return env.supabaseUrl || defaultValue;
    case ENV_KEYS.supabaseAnonKey:
      return env.supabaseAnonKey || defaultValue;
    default:
      return defaultValue;
  }
};

export const SUPABASE_URL = env.supabaseUrl;
export const SUPABASE_ANON_KEY = env.supabaseAnonKey;
export const GOOGLE_MAPS_API_KEY = env.googleMapsApiKey;

// API Configuration
export const API_BASE_URL = SUPABASE_URL || '';

// App Configuration
export const APP_NAME = 'AIHP CrewTrack';
export const APP_VERSION = '1.0.0';

// Environment
export const IS_PRODUCTION = !__DEV__;
export const IS_DEVELOPMENT = __DEV__;

// GPS Configuration
export const GPS_UPDATE_INTERVAL = 30000;
export const GPS_ACCURACY_BUFFER = 15;
export const DEFAULT_GEOFENCE_RADIUS = 200;

// Production optimizations
export const QUERY_STALE_TIME = IS_PRODUCTION ? 5 * 60 * 1000 : 0;
export const QUERY_CACHE_TIME = 10 * 60 * 1000;

// Image Configuration
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
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
