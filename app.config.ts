import 'dotenv/config';
import type { ExpoConfig } from '@expo/config-types';
import packageJson from './package.json';

type AppVariant = 'production' | 'staging' | 'development';

const getEnv = (...keys: string[]) =>
  keys.map((key) => process.env[key]).find((value) => typeof value === 'string' && value.trim()) || '';

const supabaseUrl = getEnv('EXPO_PUBLIC_SUPABASE_URL');
const supabaseAnonKey = getEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY');
const googleMapsApiKey = getEnv('EXPO_PUBLIC_GOOGLE_MAPS_API_KEY');
const getExistingPath = (...candidates: string[]) => {
  const fsModule = eval('require')('fs');
  const pathModule = eval('require')('path');

  for (const candidate of candidates) {
    if (!candidate) continue;
    const absolute = pathModule.isAbsolute(candidate) ? candidate : pathModule.resolve(candidate);
    if (fsModule.existsSync(absolute)) {
      return absolute;
    }
  }
  return undefined;
};

const appVariant = (getEnv('APP_VARIANT').toLowerCase() || 'production') as AppVariant;
const isStagingVariant = appVariant === 'staging';
const androidGoogleServicesFile = isStagingVariant
  ? getExistingPath(
      getEnv('EXPO_ANDROID_GOOGLE_SERVICES_FILE_STAGING', 'GOOGLE_SERVICES_FILE_STAGING'),
      './google-services.staging.json',
      './android/app/google-services.json'
    )
  : getExistingPath(
      getEnv('EXPO_ANDROID_GOOGLE_SERVICES_FILE', 'GOOGLE_SERVICES_FILE'),
      './google-services.json',
      './android/app/google-services.json'
    );

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
    enabled: true,
    url: 'https://u.expo.dev/0fb5aecb-8923-4ed3-a7b4-009652522764',
    checkAutomatically: 'ON_LOAD',
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
    googleServicesFile: androidGoogleServicesFile,
    blockedPermissions: ['android.permission.RECORD_AUDIO'],
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#0f172a',
    },
    permissions: ['POST_NOTIFICATIONS'],

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
    'expo-build-properties',
    {
      android: {},
      ios: {},
    },
  ],

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
    'expo-notifications',
    {
      defaultChannel: 'default',
    },
  ],
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
    environment: appVariant,
  },
};

export default {
  expo: config,
};
