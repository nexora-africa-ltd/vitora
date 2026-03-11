import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '@/constants/theme';
import { patientsApi } from '@/lib/api/patients';
import { useAppTheme } from '@/lib/theme/theme-context';

interface PatientQRCodeProps {
  patientId: number;
  mrn: string;
  patientName: string;
  variant?: 'card' | 'inline';
}

export function PatientQRCode({ patientId, mrn, patientName, variant = 'card' }: PatientQRCodeProps) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [expanded, setExpanded] = useState(false);
  const previewSize = variant === 'inline' ? 56 : 100;

  const { data, isLoading } = useQuery({
    queryKey: ['patient-qr-code', patientId],
    queryFn: () => patientsApi.getQRCode(patientId),
    staleTime: Infinity,
  });

  if (isLoading) {
    return (
      <View style={styles.previewContainer}>
        <ActivityIndicator size="small" color={theme.colors.primary} />
      </View>
    );
  }

  if (!data) return null;

  return (
    <>
      <Pressable onPress={() => setExpanded(true)} style={styles.previewContainer}>
        <View style={styles.qrBackground}>
          <Image source={{ uri: data.qr_data_uri }} style={{ width: previewSize, height: previewSize }} />
        </View>
        {variant === 'card' && (
          <Text style={styles.tapHint}>Tap to enlarge</Text>
        )}
      </Pressable>

      <Modal visible={expanded} transparent animationType="fade" onRequestClose={() => setExpanded(false)}>
        <Pressable style={styles.overlay} onPress={() => setExpanded(false)}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Patient QR Code</Text>
              <Pressable onPress={() => setExpanded(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </Pressable>
            </View>

            <View style={styles.qrLargeContainer}>
              <Image source={{ uri: data.qr_data_uri }} style={{ width: 220, height: 220 }} />
            </View>

            <Text style={styles.patientName}>{patientName}</Text>
            <Text style={styles.mrnText}>{mrn}</Text>
            <Text style={styles.hintText}>Scan this QR code at check-in to quickly find this patient.</Text>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    previewContainer: {
      alignItems: 'center',
      gap: 6,
    },
    qrBackground: {
      backgroundColor: '#FFFFFF',
      borderRadius: 8,
      padding: 8,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    tapHint: {
      color: theme.colors.mutedText,
      fontSize: 11,
    },
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    modalCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 20,
      padding: 24,
      width: '100%',
      maxWidth: 340,
      alignItems: 'center',
      gap: 12,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      width: '100%',
    },
    modalTitle: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: '700',
    },
    qrLargeContainer: {
      backgroundColor: '#FFFFFF',
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    patientName: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: '700',
      textAlign: 'center',
    },
    mrnText: {
      color: theme.colors.mutedText,
      fontSize: 14,
      fontFamily: 'monospace',
    },
    hintText: {
      color: theme.colors.mutedText,
      fontSize: 12,
      textAlign: 'center',
      lineHeight: 18,
    },
  });
}
