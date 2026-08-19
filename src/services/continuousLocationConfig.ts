export const CONTINUOUS_LOCATION_TASK = 'AIHP_BACKGROUND_LOCATION_TRACKING';

export const CONTINUOUS_LOCATION_INTERVALS = {
  timeMs: 30_000,
  distanceMeters: 25,
  heartbeatMs: 60_000,
} as const;

export const CONTINUOUS_LOCATION_STORAGE_KEYS = {
  isTracking: '@LocSvc:isTracking',
  employeeId: '@LocSvc:employeeId',
  siteId: '@LocSvc:siteId',
  lastSentTimestamp: '@LocSvc:lastSentTs',
  lastSentLatitude: '@LocSvc:lastSentLat',
  lastSentLongitude: '@LocSvc:lastSentLng',
  lastError: '@LocSvc:lastError',
  logs: '@LocSvc:logs',
} as const;
