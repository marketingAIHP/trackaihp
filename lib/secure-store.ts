import * as SecureStore from 'expo-secure-store';

export async function setSecureItem(key: string, value: string) {
  await SecureStore.setItemAsync(key, value);
}

export async function getSecureItem(key: string) {
  return SecureStore.getItemAsync(key);
}

export async function deleteSecureItem(key: string) {
  await SecureStore.deleteItemAsync(key);
}

export const secureStoreAdapter = {
  getItem: getSecureItem,
  setItem: setSecureItem,
  removeItem: deleteSecureItem,
};
