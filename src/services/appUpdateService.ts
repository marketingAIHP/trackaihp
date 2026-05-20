import * as Application from 'expo-application';
import * as Updates from 'expo-updates';
import { Linking, Platform } from 'react-native';
import { isSupabaseConfigured, supabase } from './supabase';
import { logger } from '../utils/logger';

const APP_DEPLOYMENT_ID = 'aihp-crewtrack';
const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;
const POLICY_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

type SupportedPlatform = 'android' | 'ios';

export interface AppDeploymentPolicy {
  id: number;
  app_id: string;
  channel: string;
  platform: SupportedPlatform | 'all';
  minimum_supported_version: string | null;
  recommended_version: string | null;
  force_native_update: boolean;
  update_title: string | null;
  update_message: string | null;
  download_url: string | null;
  is_active: boolean;
  updated_at: string;
}

export interface ForceUpdateRequirement {
  required: boolean;
  currentVersion: string;
  recommendedVersion: string | null;
  minimumSupportedVersion: string | null;
  downloadUrl: string | null;
  title: string;
  message: string;
  channel: string;
  platform: SupportedPlatform;
}

export interface RuntimeEnvironmentInfo {
  appVersion: string;
  buildVersion: string | null;
  channel: string;
  runtimeVersion: string | null;
  updateId: string | null;
  isEmbeddedLaunch: boolean;
  isEmergencyLaunch: boolean;
  emergencyLaunchReason: string | null;
  isUpdatesEnabled: boolean;
}

export interface OtaUpdateCheckResult {
  status:
    | 'disabled'
    | 'throttled'
    | 'up-to-date'
    | 'update-downloaded'
    | 'rollback-downloaded'
    | 'error';
  message?: string;
}

let lastUpdateCheckAt = 0;
let lastPolicyFetchAt = 0;
let cachedPolicyKey: string | null = null;
let cachedPolicy: AppDeploymentPolicy | null = null;

function getPlatform(): SupportedPlatform {
  return Platform.OS === 'ios' ? 'ios' : 'android';
}

function getChannel(): string {
  return Updates.channel || 'development';
}

function getAppVersion(): string {
  return Application.nativeApplicationVersion || '0.0.0';
}

function normalizeVersion(version: string | null | undefined): number[] {
  if (!version) {
    return [0];
  }

  const sanitized = version.trim();
  if (!sanitized) {
    return [0];
  }

  return sanitized
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map((segment) => Number.parseInt(segment, 10))
    .filter((segment) => Number.isFinite(segment));
}

function compareVersions(left: string | null | undefined, right: string | null | undefined): number {
  const leftParts = normalizeVersion(left);
  const rightParts = normalizeVersion(right);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;

    if (leftValue > rightValue) {
      return 1;
    }

    if (leftValue < rightValue) {
      return -1;
    }
  }

  return 0;
}

function canUseOtaUpdates(): boolean {
  return Platform.OS !== 'web' && !__DEV__ && Updates.isEnabled;
}

async function fetchDeploymentPolicy(
  force = false
): Promise<AppDeploymentPolicy | null> {
  if (!isSupabaseConfigured) {
    return null;
  }

  const platform = getPlatform();
  const channel = getChannel();
  const cacheKey = `${platform}:${channel}`;
  const now = Date.now();

  if (
    !force &&
    cachedPolicyKey === cacheKey &&
    cachedPolicy &&
    now - lastPolicyFetchAt < POLICY_REFRESH_INTERVAL_MS
  ) {
    return cachedPolicy;
  }

  const { data, error } = await supabase
    .from('app_deployment_policies')
    .select(
      'id, app_id, channel, platform, minimum_supported_version, recommended_version, force_native_update, update_title, update_message, download_url, is_active, updated_at'
    )
    .eq('app_id', APP_DEPLOYMENT_ID)
    .eq('channel', channel)
    .eq('is_active', true)
    .in('platform', [platform, 'all']);

  if (error) {
    logger.warn('[Updates] Failed to load deployment policy:', error);
    return null;
  }

  const rows = (data || []) as AppDeploymentPolicy[];
  const selectedPolicy =
    rows.find((row) => row.platform === platform) ||
    rows.find((row) => row.platform === 'all') ||
    null;

  cachedPolicyKey = cacheKey;
  cachedPolicy = selectedPolicy;
  lastPolicyFetchAt = now;

  return selectedPolicy;
}

function buildForceUpdateRequirement(
  policy: AppDeploymentPolicy | null
): ForceUpdateRequirement {
  const currentVersion = getAppVersion();
  const channel = getChannel();
  const platform = getPlatform();

  if (!policy) {
    return {
      required: false,
      currentVersion,
      recommendedVersion: null,
      minimumSupportedVersion: null,
      downloadUrl: null,
      title: 'Update required',
      message: 'Install the latest APK shared by your administrator to continue.',
      channel,
      platform,
    };
  }

  const isBelowMinimum =
    !!policy.minimum_supported_version &&
    compareVersions(currentVersion, policy.minimum_supported_version) < 0;
  const isBelowRecommended =
    !!policy.recommended_version &&
    compareVersions(currentVersion, policy.recommended_version) < 0;
  const required = isBelowMinimum || (policy.force_native_update && isBelowRecommended);

  return {
    required,
    currentVersion,
    recommendedVersion: policy.recommended_version,
    minimumSupportedVersion: policy.minimum_supported_version,
    downloadUrl: policy.download_url,
    title: policy.update_title || 'Update required',
    message:
      policy.update_message ||
      'A newer APK is required for this build. Install the latest version shared by your administrator.',
    channel,
    platform,
  };
}

const appUpdateService = {
  getRuntimeEnvironmentInfo(): RuntimeEnvironmentInfo {
    return {
      appVersion: getAppVersion(),
      buildVersion: Application.nativeBuildVersion || null,
      channel: getChannel(),
      runtimeVersion: Updates.runtimeVersion,
      updateId: Updates.updateId,
      isEmbeddedLaunch: Updates.isEmbeddedLaunch,
      isEmergencyLaunch: Updates.isEmergencyLaunch,
      emergencyLaunchReason: Updates.emergencyLaunchReason,
      isUpdatesEnabled: canUseOtaUpdates(),
    };
  },

  async getForceUpdateRequirement(force = false): Promise<ForceUpdateRequirement> {
    const policy = await fetchDeploymentPolicy(force);
    return buildForceUpdateRequirement(policy);
  },

  async checkForOtaUpdate(force = false): Promise<OtaUpdateCheckResult> {
    if (!canUseOtaUpdates()) {
      return { status: 'disabled' };
    }

    const now = Date.now();
    if (!force && now - lastUpdateCheckAt < UPDATE_CHECK_INTERVAL_MS) {
      return { status: 'throttled' };
    }

    lastUpdateCheckAt = now;

    try {
      const updateResult = await Updates.checkForUpdateAsync();

      if (updateResult.isRollBackToEmbedded) {
        const rollbackResult = await Updates.fetchUpdateAsync();
        return rollbackResult.isRollBackToEmbedded
          ? { status: 'rollback-downloaded' }
          : { status: 'up-to-date' };
      }

      if (!updateResult.isAvailable) {
        return { status: 'up-to-date' };
      }

      const fetchedUpdate = await Updates.fetchUpdateAsync();
      if (fetchedUpdate.isRollBackToEmbedded) {
        return { status: 'rollback-downloaded' };
      }

      if (fetchedUpdate.isNew) {
        return { status: 'update-downloaded' };
      }

      return { status: 'up-to-date' };
    } catch (error: any) {
      logger.warn('[Updates] OTA update check failed:', error);
      return {
        status: 'error',
        message: error?.message || 'Failed to check for updates.',
      };
    }
  },

  async reloadToApplyUpdate(): Promise<void> {
    if (!canUseOtaUpdates()) {
      throw new Error('OTA updates are not enabled for this build.');
    }

    await Updates.reloadAsync();
  },

  async openDownloadUrl(downloadUrl: string | null | undefined): Promise<boolean> {
    if (!downloadUrl) {
      return false;
    }

    const supported = await Linking.canOpenURL(downloadUrl);
    if (!supported) {
      return false;
    }

    await Linking.openURL(downloadUrl);
    return true;
  },
};

export default appUpdateService;
