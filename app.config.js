import 'dotenv/config';

const getEnv = (...keys) => keys.map((key) => process.env[key]).find(Boolean) || '';

const supabaseUrl = getEnv('SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_URL');
const supabaseAnonKey = getEnv('SUPABASE_ANON_KEY', 'EXPO_PUBLIC_SUPABASE_ANON_KEY');
const googleMapsApiKey = getEnv('GOOGLE_MAPS_API_KEY', 'EXPO_PUBLIC_GOOGLE_MAPS_API_KEY');

export default {
  expo: {
    name: 'AIHP CrewTrack',
    slug: 'aihp-crewtrack',
    owner: 'aihp',
    version: '1.0.0',
    orientation: 'portrait',
    updates: {
      url: 'https://u.expo.dev/0fb5aecb-8923-4ed3-a7b4-009652522764',
    },
    runtimeVersion: '1.0.0',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#0f172a',
    },
    assetBundlePatterns: ['**/*'],
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.aihp.crewtrack',
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
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#0f172a',
      },
      package: 'com.aihp.crewtrack',
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
      name: 'AIHP CrewTrack',
      shortName: 'CrewTrack',
      themeColor: '#0f172a',
      backgroundColor: '#f8fafc',
      display: 'standalone',
      lang: 'en',
      description: 'Employee attendance, GPS check-in/out, history, and report downloads for AIHP crews.',
    },
    plugins: [
      'expo-asset',
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
      // Note: react-native-maps requires a development build
      // For Expo Go, maps will show a placeholder or use web maps
    ],
    extra: {
      supabaseUrl,
      supabaseAnonKey,
      googleMapsApiKey,
      eas: {
        projectId: '0fb5aecb-8923-4ed3-a7b4-009652522764',
      },
      // Environment flag for runtime checks
      environment: process.env.NODE_ENV || 'development',
    },
  },
};
