import * as Haptics from 'expo-haptics';

async function runHaptic(effect: () => Promise<void>) {
  try {
    await effect();
  } catch {
    // Haptics are best-effort only.
  }
}

export async function notifySuccessHaptic() {
  await runHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

export async function notifyWarningHaptic() {
  await runHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}

export async function notifyErrorHaptic() {
  await runHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
}

export async function notifySelectionHaptic() {
  await runHaptic(() => Haptics.selectionAsync());
}
