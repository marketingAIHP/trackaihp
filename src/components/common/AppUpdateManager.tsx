import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Button, Card, Dialog, Portal, Text, useTheme } from 'react-native-paper';
import { useAppUpdates } from '../../hooks/useAppUpdates';

interface AppUpdateManagerProps {
  enabled?: boolean;
}

export function AppUpdateManager({
  enabled = true,
}: AppUpdateManagerProps) {
  const theme = useTheme();
  const {
    forceUpdate,
    runtimeInfo,
    isChecking,
    isDownloading,
    isApplyingUpdate,
    isUpdateReady,
    updateError,
    updatePromptTitle,
    updatePromptMessage,
    dismissUpdatePrompt,
    applyDownloadedUpdate,
    openRequiredNativeUpdate,
  } = useAppUpdates({ enabled });

  const requiresNativeUpdate = !!forceUpdate?.required;

  return (
    <>
      {requiresNativeUpdate ? (
        <View
          style={[
            styles.forceUpdateOverlay,
            { backgroundColor: theme.colors.background },
          ]}>
          <Card style={styles.forceUpdateCard}>
            <Card.Content style={styles.forceUpdateContent}>
              <Text variant="headlineSmall" style={styles.forceUpdateTitle}>
                {forceUpdate.title}
              </Text>
              <Text variant="bodyMedium" style={styles.forceUpdateBody}>
                {forceUpdate.message}
              </Text>
              <View style={styles.versionBlock}>
                <Text variant="labelLarge">
                  Installed version: {forceUpdate.currentVersion}
                </Text>
                {forceUpdate.minimumSupportedVersion ? (
                  <Text variant="bodySmall" style={styles.versionMeta}>
                    Minimum supported version: {forceUpdate.minimumSupportedVersion}
                  </Text>
                ) : null}
                {forceUpdate.recommendedVersion ? (
                  <Text variant="bodySmall" style={styles.versionMeta}>
                    Recommended version: {forceUpdate.recommendedVersion}
                  </Text>
                ) : null}
                <Text variant="bodySmall" style={styles.versionMeta}>
                  Channel: {runtimeInfo.channel || 'development'} | Runtime:{' '}
                  {runtimeInfo.runtimeVersion || 'n/a'}
                </Text>
              </View>
              <Button
                mode="contained"
                onPress={() => {
                  void openRequiredNativeUpdate();
                }}
                disabled={!forceUpdate.downloadUrl}
                style={styles.primaryButton}>
                Download latest APK
              </Button>
              {!forceUpdate.downloadUrl ? (
                <Text variant="bodySmall" style={styles.secondaryText}>
                  Ask your administrator for the latest APK download link.
                </Text>
              ) : null}
            </Card.Content>
          </Card>
        </View>
      ) : null}

      <Portal>
        <Dialog
          visible={isUpdateReady}
          dismissable={!isApplyingUpdate}
          onDismiss={dismissUpdatePrompt}>
          <Dialog.Title>{updatePromptTitle}</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">{updatePromptMessage}</Text>
            {(isChecking || isDownloading) && !isApplyingUpdate ? (
              <View style={styles.statusRow}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <Text variant="bodySmall" style={styles.statusText}>
                  {isDownloading ? 'Downloading update...' : 'Checking for updates...'}
                </Text>
              </View>
            ) : null}
            {updateError ? (
              <Text variant="bodySmall" style={styles.errorText}>
                {updateError}
              </Text>
            ) : null}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={dismissUpdatePrompt} disabled={isApplyingUpdate}>
              Later
            </Button>
            <Button
              mode="contained"
              onPress={() => {
                void applyDownloadedUpdate();
              }}
              loading={isApplyingUpdate}>
              Restart now
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  forceUpdateOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  forceUpdateCard: {
    width: '100%',
    maxWidth: 520,
  },
  forceUpdateContent: {
    gap: 14,
  },
  forceUpdateTitle: {
    fontWeight: '700',
  },
  forceUpdateBody: {
    lineHeight: 22,
  },
  versionBlock: {
    gap: 4,
  },
  versionMeta: {
    opacity: 0.75,
  },
  primaryButton: {
    marginTop: 8,
  },
  secondaryText: {
    opacity: 0.75,
    textAlign: 'center',
  },
  statusRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusText: {
    opacity: 0.75,
  },
  errorText: {
    marginTop: 12,
    opacity: 0.85,
  },
});
