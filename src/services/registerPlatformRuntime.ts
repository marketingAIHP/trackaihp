import { Platform } from 'react-native';

const runtime =
  Platform.OS === 'web'
    ? require('./registerPlatformRuntime.web')
    : require('./registerPlatformRuntime.native');

export const registerPlatformRuntime = runtime.registerPlatformRuntime as typeof import('./registerPlatformRuntime.native').registerPlatformRuntime;
