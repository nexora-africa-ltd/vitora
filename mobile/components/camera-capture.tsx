import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { AppButton, SectionCard } from '@/components/app-ui';
import type { AppTheme } from '@/constants/theme';
import type { ScreeningPhotoAttachment } from '@/lib/types/screening';
import { useAppTheme } from '@/lib/theme/theme-context';

export function CameraCapture({ value, onChange }: { value: ScreeningPhotoAttachment | null; onChange: (value: ScreeningPhotoAttachment | null) => void }) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [permission, requestPermission] = useCameraPermissions();
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const cameraRef = useRef<CameraView | null>(null);

  async function handleTakePhoto() {
    if (!cameraRef.current) {
      return;
    }

    setIsCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.65 });
      onChange({
        uri: photo.uri,
        width: photo.width ?? null,
        height: photo.height ?? null,
        captured_at: new Date().toISOString(),
      });
      setIsCameraOpen(false);
    } finally {
      setIsCapturing(false);
    }
  }

  async function handleOpenCamera() {
    if (!permission?.granted) {
      const nextPermission = await requestPermission();
      if (!nextPermission.granted) {
        return;
      }
    }

    setIsCameraOpen(true);
  }

  return (
    <SectionCard title="Photo capture" subtitle="Attach a wound, rash, or field-visit photo to this screening record.">
      {value ? (
        <View style={styles.previewBlock}>
          <Image source={{ uri: value.uri }} style={styles.previewImage} contentFit="cover" />
          <Text style={styles.helperText}>Captured {new Date(value.captured_at).toLocaleString()}</Text>
          <View style={styles.actionRow}>
            <AppButton label="Retake photo" onPress={() => void handleOpenCamera()} variant="secondary" />
            <AppButton label="Remove photo" onPress={() => onChange(null)} variant="ghost" />
          </View>
        </View>
      ) : null}

      {!value && !isCameraOpen ? <AppButton label="Open camera" onPress={() => void handleOpenCamera()} /> : null}

      {isCameraOpen ? (
        <View style={styles.cameraShell}>
          {Platform.OS === 'web' ? (
            <Text style={styles.helperText}>Web preview depends on browser camera permissions. If preview does not appear, allow camera access and retry.</Text>
          ) : null}
          <CameraView ref={cameraRef} style={styles.cameraPreview} facing="back" />
          <View style={styles.actionRow}>
            <AppButton label={isCapturing ? 'Capturing...' : 'Take photo'} onPress={() => void handleTakePhoto()} disabled={isCapturing} />
            <AppButton label="Cancel" onPress={() => setIsCameraOpen(false)} variant="ghost" />
          </View>
        </View>
      ) : null}
    </SectionCard>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    actionRow: {
      flexDirection: 'row',
      gap: 12,
      flexWrap: 'wrap',
    },
    cameraPreview: {
      borderRadius: theme.radius.md,
      height: 280,
      overflow: 'hidden',
      width: '100%',
    },
    cameraShell: {
      gap: 12,
    },
    helperText: {
      color: theme.colors.mutedText,
      fontSize: 13,
      lineHeight: 18,
    },
    previewBlock: {
      gap: 12,
    },
    previewImage: {
      borderRadius: theme.radius.md,
      height: 220,
      width: '100%',
    },
  });
}