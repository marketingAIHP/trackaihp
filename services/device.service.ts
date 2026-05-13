import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { v4 as uuidv4 } from 'uuid';
import { getSecureItem, setSecureItem } from '../lib/secure-store';
import type { DeviceContext } from '../types/device-auth';

const INSTALLATION_ID_KEY = 'device_binding_installation_id';

export async function getOrCreateInstallationId() {
  const existing = await getSecureItem(INSTALLATION_ID_KEY);
  if (existing) {
    return existing;
  }

  const created = uuidv4();
  await setSecureItem(INSTALLATION_ID_KEY, created);
  return created;
}

export async function getDeviceContext(): Promise<DeviceContext> {
  const installationId = await getOrCreateInstallationId();
  const androidId = Application.getAndroidId?.() ?? '';

  if (!androidId) {
    throw new Error(
      'Android device ID is unavailable. Use an Android development build or production build.',
    );
  }

  return {
    installationId,
    androidId,
    deviceBrand: Device.brand ?? null,
    deviceModel: Device.modelName ?? null,
    osVersion: Device.osVersion ?? null,
    appVersion: Application.nativeApplicationVersion ?? null,
  };
}
