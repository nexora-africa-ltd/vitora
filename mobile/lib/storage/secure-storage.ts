import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

export async function secureStoreIsUsable(): Promise<boolean> {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function setSensitiveValue(key: string, value: string): Promise<void> {
  if (await secureStoreIsUsable()) {
    await SecureStore.setItemAsync(key, value);
    await AsyncStorage.removeItem(key);
    return;
  }

  await AsyncStorage.setItem(key, value);
}

export async function getSensitiveValue(key: string): Promise<string | null> {
  if (await secureStoreIsUsable()) {
    const secureValue = await SecureStore.getItemAsync(key);
    if (secureValue != null) {
      return secureValue;
    }

    const legacyValue = await AsyncStorage.getItem(key);
    if (legacyValue != null) {
      await SecureStore.setItemAsync(key, legacyValue);
      await AsyncStorage.removeItem(key);
    }

    return legacyValue;
  }

  return AsyncStorage.getItem(key);
}

export async function deleteSensitiveValue(key: string): Promise<void> {
  await Promise.allSettled([
    SecureStore.deleteItemAsync(key),
    AsyncStorage.removeItem(key),
  ]);
}

export async function setSensitiveJsonValue<T>(key: string, value: T): Promise<void> {
  await setSensitiveValue(key, JSON.stringify(value));
}

export async function getSensitiveJsonValue<T>(key: string): Promise<T | null> {
  const rawValue = await getSensitiveValue(key);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    await deleteSensitiveValue(key);
    return null;
  }
}