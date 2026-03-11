import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-ui';
import type { AppTheme } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme/theme-context';

interface QRScannerDialogProps {
  onScan: (mrn: string) => void;
  label?: string;
}

/** Parse the Vitora QR payload (VITORA:MRN:{mrn}) or a raw MRN string */
function parseQRPayload(raw: string): string | null {
  const match = raw.match(/^VITORA:MRN:(.+)$/);
  if (match?.[1]) return match[1];
  if (raw.startsWith('MRN-')) return raw;
  return null;
}

export function QRScannerDialog({ onScan, label = 'Scan QR' }: QRScannerDialogProps) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();

  async function handleOpen() {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        setError('Camera permission is required to scan QR codes.');
        setOpen(true);
        return;
      }
    }
    setError(null);
    setOpen(true);
  }

  function handleBarCodeScanned(result: { data: string }) {
    const mrn = parseQRPayload(result.data);
    if (mrn) {
      setOpen(false);
      onScan(mrn);
    } else {
      setError('Not a Vitora patient QR code. Expected format: VITORA:MRN:...');
    }
  }

  return (
    <>
      <AppButton label={label} onPress={handleOpen} variant="secondary" />

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Scan Patient QR Code</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={12}>
              <Ionicons name="close" size={28} color={theme.colors.text} />
            </Pressable>
          </View>

          {error ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={48} color={theme.colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
              {!permission?.granted ? (
                <AppButton label="Grant camera access" onPress={requestPermission} />
              ) : (
                <AppButton label="Try again" onPress={() => setError(null)} variant="secondary" />
              )}
            </View>
          ) : (
            <View style={styles.cameraContainer}>
              <CameraView
                style={styles.camera}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={handleBarCodeScanned}
              />
              <View style={styles.overlay}>
                <View style={styles.scanFrame} />
                <Text style={styles.scanHint}>Point the camera at a Vitora patient QR code</Text>
              </View>
            </View>
          )}
        </View>
      </Modal>
    </>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
      paddingTop: 56,
      backgroundColor: theme.colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    title: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: '700',
    },
    cameraContainer: {
      flex: 1,
    },
    camera: {
      flex: 1,
    },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 24,
    },
    scanFrame: {
      width: 250,
      height: 250,
      borderWidth: 3,
      borderColor: '#FFFFFF',
      borderRadius: 16,
      backgroundColor: 'transparent',
    },
    scanHint: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '600',
      textAlign: 'center',
      textShadowColor: 'rgba(0,0,0,0.6)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
      paddingHorizontal: 32,
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 16,
      padding: 32,
    },
    errorText: {
      color: theme.colors.mutedText,
      fontSize: 15,
      textAlign: 'center',
      lineHeight: 22,
    },
  });
}
