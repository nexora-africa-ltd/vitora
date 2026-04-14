import * as Location from 'expo-location';

import type { ScreeningLocation } from '@/lib/types/screening';

export async function requestLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === Location.PermissionStatus.GRANTED;
}

export async function captureCurrentLocation(): Promise<ScreeningLocation> {
  const granted = await requestLocationPermission();
  if (!granted) {
    throw new Error('Location permission is required to capture field visit coordinates.');
  }

  const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });

  return {
    latitude: current.coords.latitude,
    longitude: current.coords.longitude,
    accuracy: current.coords.accuracy ?? null,
    captured_at: new Date().toISOString(),
  };
}
