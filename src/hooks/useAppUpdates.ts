import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';
import { UpdateInfoType } from 'expo-updates';
import appUpdateService, {
  type ForceUpdateRequirement,
  type RuntimeEnvironmentInfo,
} from '../services/appUpdateService';
import { logger } from '../utils/logger';

interface UseAppUpdatesOptions {
  enabled?: boolean;
  startupDelayMs?: number;
}

interface UseAppUpdatesResult {
  forceUpdate: ForceUpdateRequirement | null;
  runtimeInfo: RuntimeEnvironmentInfo;
  isChecking: boolean;
  isDownloading: boolean;
  isApplyingUpdate: boolean;
  isUpdateReady: boolean;
  updateError: string | null;
  updatePromptTitle: string;
  updatePromptMessage: string;
  dismissUpdatePrompt: () => void;
  applyDownloadedUpdate: () => Promise<void>;
  openRequiredNativeUpdate: () => Promise<boolean>;
  checkNow: () => Promise<void>;
}

export function useAppUpdates(
  options: UseAppUpdatesOptions = {}
): UseAppUpdatesResult {
  const { enabled = true, startupDelayMs = 1200 } = options;
  const nativeUpdates = Updates.useUpdates();
  const [forceUpdate, setForceUpdate] = useState<ForceUpdateRequirement | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [isRefreshingPolicy, setIsRefreshingPolicy] = useState(false);
  const [isApplyingUpdate, setIsApplyingUpdate] = useState(false);
  const [dismissedUpdateId, setDismissedUpdateId] = useState<string | null>(null);

  const runtimeInfo = useMemo(
    () => appUpdateService.getRuntimeEnvironmentInfo(),
    [
      nativeUpdates.currentlyRunning.channel,
      nativeUpdates.currentlyRunning.updateId,
      nativeUpdates.currentlyRunning.runtimeVersion,
      nativeUpdates.currentlyRunning.isEmbeddedLaunch,
      nativeUpdates.currentlyRunning.isEmergencyLaunch,
      nativeUpdates.currentlyRunning.emergencyLaunchReason,
    ]
  );

  const downloadedUpdateId = useMemo(() => {
    if (!nativeUpdates.downloadedUpdate) {
      return null;
    }

    return nativeUpdates.downloadedUpdate.type === UpdateInfoType.NEW
      ? nativeUpdates.downloadedUpdate.updateId
      : 'rollback-to-embedded';
  }, [nativeUpdates.downloadedUpdate]);

  const refreshUpdateState = useCallback(
    async (force = false) => {
      if (!enabled) {
        return;
      }

      setIsRefreshingPolicy(true);

      try {
        const nextForceUpdate = await appUpdateService.getForceUpdateRequirement(force);
        setForceUpdate(nextForceUpdate);

        if (nextForceUpdate.required) {
          setUpdateError(null);
          return;
        }

        const otaResult = await appUpdateService.checkForOtaUpdate(force);
        if (otaResult.status === 'error') {
          setUpdateError(otaResult.message || 'Failed to check for updates.');
        } else {
          setUpdateError(null);
        }
      } catch (error: any) {
        logger.warn('[Updates] Failed to refresh app update state:', error);
        setUpdateError(error?.message || 'Failed to check for updates.');
      } finally {
        setIsRefreshingPolicy(false);
      }
    },
    [enabled]
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const timer = setTimeout(() => {
      void refreshUpdateState(true);
    }, startupDelayMs);

    return () => {
      clearTimeout(timer);
    };
  }, [enabled, refreshUpdateState, startupDelayMs]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void refreshUpdateState(false);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [enabled, refreshUpdateState]);

  useEffect(() => {
    if (nativeUpdates.checkError) {
      logger.warn('[Updates] Native check error:', nativeUpdates.checkError);
      setUpdateError(nativeUpdates.checkError.message);
    }
  }, [nativeUpdates.checkError]);

  useEffect(() => {
    if (nativeUpdates.downloadError) {
      logger.warn('[Updates] Native download error:', nativeUpdates.downloadError);
      setUpdateError(nativeUpdates.downloadError.message);
    }
  }, [nativeUpdates.downloadError]);

  useEffect(() => {
    if (!downloadedUpdateId) {
      setDismissedUpdateId(null);
      return;
    }

    if (downloadedUpdateId !== dismissedUpdateId) {
      setUpdateError(null);
    }
  }, [dismissedUpdateId, downloadedUpdateId]);

  const dismissUpdatePrompt = useCallback(() => {
    if (downloadedUpdateId) {
      setDismissedUpdateId(downloadedUpdateId);
    }
  }, [downloadedUpdateId]);

  const applyDownloadedUpdate = useCallback(async () => {
    setIsApplyingUpdate(true);

    try {
      await appUpdateService.reloadToApplyUpdate();
    } finally {
      setIsApplyingUpdate(false);
    }
  }, []);

  const openRequiredNativeUpdate = useCallback(async () => {
    return appUpdateService.openDownloadUrl(forceUpdate?.downloadUrl);
  }, [forceUpdate?.downloadUrl]);

  const checkNow = useCallback(async () => {
    await refreshUpdateState(true);
  }, [refreshUpdateState]);

  const isUpdateReady =
    !!downloadedUpdateId &&
    downloadedUpdateId !== dismissedUpdateId &&
    !forceUpdate?.required;

  const updatePromptTitle =
    downloadedUpdateId === 'rollback-to-embedded'
      ? 'Stability update ready'
      : 'Update ready';
  const updatePromptMessage =
    downloadedUpdateId === 'rollback-to-embedded'
      ? 'A safe rollback has been downloaded. Restart the app to apply the stable build.'
      : 'A new update has been downloaded silently. Restart the app whenever you are ready to apply it.';

  return {
    forceUpdate,
    runtimeInfo,
    isChecking: isRefreshingPolicy || nativeUpdates.isChecking,
    isDownloading: nativeUpdates.isDownloading,
    isApplyingUpdate,
    isUpdateReady,
    updateError,
    updatePromptTitle,
    updatePromptMessage,
    dismissUpdatePrompt,
    applyDownloadedUpdate,
    openRequiredNativeUpdate,
    checkNow,
  };
}
