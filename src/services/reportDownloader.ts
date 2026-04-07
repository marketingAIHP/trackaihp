import { Platform } from 'react-native';

const adapter =
  Platform.OS === 'web'
    ? require('./reportDownloader.web')
    : require('./reportDownloader.native');

export const savePlatformReportFile = adapter.savePlatformReportFile as typeof import('./reportDownloader.native').savePlatformReportFile;
