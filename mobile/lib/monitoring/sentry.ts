import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

let initialized = false;

function getSentryDsn(): string | undefined {
  const envValue = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (typeof envValue === 'string' && envValue.trim().length > 0) {
    return envValue.trim();
  }

  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const value = extra?.sentryDsn;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export function initializeSentry() {
  if (initialized) {
    return;
  }

  const dsn = getSentryDsn();
  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    enableAutoSessionTracking: true,
    enableNativeFramesTracking: true,
    tracesSampleRate: 0.1,
    profilesSampleRate: 0.1,
  });
  initialized = true;
}

export function captureAppException(error: unknown, extras?: Record<string, unknown>) {
  if (!initialized) {
    return;
  }

  Sentry.captureException(error, {
    extra: extras,
  });
}