import { Coordinates } from '../types';

export interface LocationPermissionResult {
  granted: boolean;
  canAskAgain?: boolean;
  status?: 'granted' | 'denied' | 'prompt' | 'unavailable' | 'undetermined';
}

export interface PlatformLocationResult {
  coordinates: Coordinates;
  accuracy: number | null;
  timestamp: number;
}

export interface PlatformLocationOptions {
  preferCached?: boolean;
  targetAccuracy?: number;
  timeoutMs?: number;
}

export interface PlatformLocationWatchOptions {
  distanceInterval?: number;
  timeInterval?: number;
  accuracy?: number;
}

export interface PlatformLocationSubscription {
  remove: () => void;
}
