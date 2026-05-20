import 'dotenv/config';
import type { ExpoConfig } from '@expo/config-types';
import packageJson from './package.json';

type AppVariant = 'production' | 'staging' | 'development';

const getEnv = (...keys: string[]) =>
  keys.map((key) => process.env[key]).find((value) => typeof value === 'string' && value.trim()) || '';

const supabaseUrl = getEnv('EXPO_PUBLIC_SUPABASE_URL');
const supabaseAnonKey = getEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY');
const googleMapsApiKey = getEnv('EXPO_PUBLIC_GOOGLE_MAPS_API_KEY');

const appVariant = (getEnv('APP_VARIANT').toLowerCase() || 'production') as AppVariant;
const isStagingVariant = appVariant === 'staging';

const appName = isStagingVariant ? 'AIHP CrewTrack Staging' : 'AIHP CrewTrack';
const androidPackage = isStagingVariant
  ? 'com.aihp.crewtrack.staging'
  : 'com.aihp.crewtrack';
const iosBundleIdentifier = isStagingVariant
  ? 'com.aihp.crewtrack.staging'
  : 'com.aihp.crewtrack';

const config: ExpoConfig = {
  name: appName,
  slug: 'aihp-crewtrack',
  owner: 'aihp',
  version: packageJson.version,
  runtimeVersion: {
    policy: 'appVersion',
  },
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: isStagingVariant ? 'crewtrack-staging' : 'crewtrack',
  userInterfaceStyle: 'automatic',
  jsEngine: 'hermes',
  updates: {
    url: 'https://u.expo.dev/0fb5aecb-8923-4ed3-a7b4-009652522764',
    checkAutomatically: 'ON_ERROR_RECOVERY',
    fallbackToCacheTimeout: 0,
  },
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#0f172a',
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: iosBundleIdentifier,
    buildNumber: '1',
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSLocationWhenInUseUsageDescription:
        'We need your location to track attendance and work site proximity',
      NSLocationAlwaysUsageDescription:
        'We need your location to track attendance and work site proximity',
      NSLocationAlwaysAndWhenInUseUsageDescription:
        'We need your location to track attendance and work site proximity',
    },
    config: {
      googleMapsApiKey,
    },
  },
  android: {
    package: androidPackage,
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#0f172a',
    },
    permissions: [
      'ACCESS_FINE_LOCATION',
      'ACCESS_COARSE_LOCATION',
      'ACCESS_BACKGROUND_LOCATION',
      'POST_NOTIFICATIONS',
      'FOREGROUND_SERVICE',
      'FOREGROUND_SERVICE_LOCATION',
    ],
    config: {
      googleMaps: {
        apiKey: googleMapsApiKey,
      },
    },
  },
  web: {
    favicon: './assets/favicon.png',
    name: appName,
    shortName: isStagingVariant ? 'CrewTrack Stg' : 'CrewTrack',
    themeColor: '#0f172a',
    backgroundColor: '#f8fafc',
    display: 'standalone',
    lang: 'en',
    description:
      'Employee attendance, GPS check-in/out, history, and report downloads for AIHP crews.',
  },
  plugins: [
    'expo-asset',
    'expo-router',
    'expo-secure-store',
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission:
          'Allow AIHP CrewTrack to use your location for attendance tracking.',
        locationAlwaysPermission:
          'Allow AIHP CrewTrack to track your location in the background while you are checked in.',
        locationWhenInUsePermission:
          'Allow AIHP CrewTrack to use your location for attendance tracking.',
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
        isIosBackgroundLocationEnabled: true,
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission:
          'The app accesses your photos to upload profile and site images.',
      },
    ],
    'expo-notifications',
  ],
  extra: {
    EXPO_PUBLIC_SUPABASE_URL: supabaseUrl,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey,
    EXPO_PUBLIC_GOOGLE_MAPS_API_KEY: googleMapsApiKey,
    deployment: {
      appId: 'aihp-crewtrack',
      variant: appVariant,
      otaCheckIntervalMs: 15 * 60 * 1000,
      forceUpdateTable: 'app_deployment_policies',
    },
    eas: {
      projectId: '0fb5aecb-8923-4ed3-a7b4-009652522764',
    },
    environment: process.env.NODE_ENV || 'development',
  },
};

export default {
  expo: config,
};
