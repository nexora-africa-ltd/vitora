import AsyncStorage from '@react-native-async-storage/async-storage';
import { MMKV } from 'react-native-mmkv';

import { getSensitiveValue, setSensitiveValue } from '@/lib/storage/secure-storage';

import { OFFLINE_DB_STORAGE_KEY } from './schema';

const OFFLINE_DB_STORAGE_ID = 'vitora.mobile.offline-db.secure';
const OFFLINE_DB_ENCRYPTION_KEY_KEY = 'vitora.mobile.offline-db.encryption-key';

let storagePromise: Promise<MMKV> | null = null;

function generateEncryptionKey(): string {
  const bytes = new Uint8Array(16);

  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(bytes, (value) => String.fromCharCode(33 + (value % 93))).join('');
}

async function getOrCreateEncryptionKey(): Promise<string> {
  const existingKey = await getSensitiveValue(OFFLINE_DB_ENCRYPTION_KEY_KEY);
  if (existingKey) {
    return existingKey;
  }

  const nextKey = generateEncryptionKey();
  await setSensitiveValue(OFFLINE_DB_ENCRYPTION_KEY_KEY, nextKey);
  return nextKey;
}

async function createOfflineStorage(): Promise<MMKV> {
  const encryptionKey = await getOrCreateEncryptionKey();
  const storage = new MMKV({
    id: OFFLINE_DB_STORAGE_ID,
    encryptionKey,
  });

  await migrateLegacyOfflinePayload(storage);

  return storage;
}

async function migrateLegacyOfflinePayload(storage: MMKV): Promise<void> {
  const encryptedValue = storage.getString(OFFLINE_DB_STORAGE_KEY);
  if (encryptedValue == null) {
    const legacyValue = await AsyncStorage.getItem(OFFLINE_DB_STORAGE_KEY);
    if (legacyValue != null) {
      storage.set(OFFLINE_DB_STORAGE_KEY, legacyValue);
      await AsyncStorage.removeItem(OFFLINE_DB_STORAGE_KEY);
    }
  }
}

async function getOfflineStorage(): Promise<MMKV> {
  storagePromise ??= createOfflineStorage();
  const storage = await storagePromise;
  await migrateLegacyOfflinePayload(storage);
  return storage;
}

export async function readOfflineDatabasePayload(): Promise<string | null> {
  const storage = await getOfflineStorage();
  return storage.getString(OFFLINE_DB_STORAGE_KEY) ?? null;
}

export async function writeOfflineDatabasePayload(payload: string): Promise<void> {
  const storage = await getOfflineStorage();
  storage.set(OFFLINE_DB_STORAGE_KEY, payload);
}

export async function removeOfflineDatabasePayload(): Promise<void> {
  const storage = await getOfflineStorage();
  storage.delete(OFFLINE_DB_STORAGE_KEY);
  await AsyncStorage.removeItem(OFFLINE_DB_STORAGE_KEY);
}
