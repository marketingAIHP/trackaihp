import { Platform } from 'react-native';

const adapter =
  Platform.OS === 'web'
    ? require('./locationAdapter.web')
    : require('./locationAdapter.native');

export const requestPlatformLocationPermission = adapter.requestPlatformLocationPermission as typeof import('./locationAdapter.native').requestPlatformLocationPermission;
export const getPlatformCurrentLocation = adapter.getPlatformCurrentLocation as typeof import('./locationAdapter.native').getPlatformCurrentLocation;
export const watchPlatformLocation = adapter.watchPlatformLocation as typeof import('./locationAdapter.native').watchPlatformLocation;
