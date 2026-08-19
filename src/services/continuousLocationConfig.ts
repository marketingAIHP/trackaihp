export const CONTINUOUS_LOCATION_TASK = 'AIHP_BACKGROUND_LOCATION_TRACKING';
export const CONTINUOUS_LOCATION_CONFIGURATION_VERSION = '2';

export const CONTINUOUS_LOCATION_INTERVALS = {
  timeMs: 30_000,
  callbackDistanceMeters: 0,
  distanceMeters: 25,
  heartbeatMs: 60_000,
} as const;

export const CONTINUOUS_LOCATION_STORAGE_KEYS = {
  isTracking: '@LocSvc:isTracking',
  employeeId: '@LocSvc:employeeId',
  attendanceId: '@LocSvc:attendanceId',
  siteId: '@LocSvc:siteId',
  siteContext: '@LocSvc:siteContext',
  lastSentTimestamp: '@LocSvc:lastSentTs',
  lastSentLatitude: '@LocSvc:lastSentLat',
  lastSentLongitude: '@LocSvc:lastSentLng',
  lastError: '@LocSvc:lastError',
  logs: '@LocSvc:logs',
  configurationVersion: '@LocSvc:configurationVersion',
} as const;
