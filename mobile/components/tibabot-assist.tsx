import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { AppTheme } from '@/constants/theme';
import { aiApi } from '@/lib/api/ai';
import type { TibaBotQuickAction } from '@/lib/ai/tibabot-navigation';
import { useAppTheme } from '@/lib/theme/theme-context';
import type { AIClinicalAssistRequest, AIPatientContext, AIEncounterContext } from '@/lib/types/ai';

// ──────────────────── Quick Actions ────────────────────

type QuickAction = TibaBotQuickAction;

const DEFAULT_QUICK_ACTIONS: QuickAction[] = [
  { id: 'differentials', label: 'Suggest differentials', icon: 'medkit-outline', query: 'Based on the clinical findings, suggest the top differential diagnoses with reasoning.' },
  { id: 'workup', label: 'Recommend workup', icon: 'flask-outline', query: 'Recommend the appropriate diagnostic workup and investigations for this presentation.' },
  { id: 'management', label: 'Management plan', icon: 'clipboard-outline', query: 'Suggest an evidence-based management plan for this patient presentation.' },
  { id: 'red-flags', label: 'Check red flags', icon: 'alert-circle-outline', query: 'Identify any red flags or warning signs that require immediate attention in this case.' },
];

// ──────────────────── Props ────────────────────

interface TibaBotAssistProps {
  patientContext?: AIPatientContext;
  encounterContext?: AIEncounterContext;
  inputPlaceholder?: string;
  quickActions?: TibaBotQuickAction[];
  sheetTitle?: string;
}

// ──────────────────── Component ────────────────────

export function TibaBotAssist({
  patientContext,
  encounterContext,
  inputPlaceholder = 'Ask a clinical question...',
  quickActions = DEFAULT_QUICK_ACTIONS,
  sheetTitle = 'TibaBot Clinical Assist',
}: TibaBotAssistProps) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Check TibaBot availability
  const statusQuery = useQuery({
    queryKey: ['ai-status'],
    queryFn: () => aiApi.status(),
    staleTime: 60_000,
    retry: 1,
  });

  const isAvailable = statusQuery.data?.service_available ?? false;

  const assistMutation = useMutation({
    mutationFn: (request: AIClinicalAssistRequest) => aiApi.assist(request),
    onSuccess: (data) => {
      if (data.error) {
        setError(data.error);
        setResponse(null);
      } else {
        setResponse(data.response);
        setError(null);
      }
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    },
    onError: () => {
      setError('TibaBot is unavailable. Please try again later.');
      setResponse(null);
    },
  });

  const feedbackMutation = useMutation({
    mutationFn: (direction: 'up' | 'down') =>
      aiApi.sendFeedback({
        message_id: `mobile-assist-${Date.now()}`,
        feedback: direction,
        user_query: query,
        bot_response: response ?? undefined,
        service_type: 'clinical_assist',
      }),
  });

  const handleSubmit = useCallback(
    (queryText: string) => {
      if (!queryText.trim()) return;
      setResponse(null);
      setError(null);
      setQuery(queryText);
      assistMutation.mutate({
        query: queryText.trim(),
        patient_context: patientContext,
        encounter_context: encounterContext,
        verbosity: 'concise',
      });
    },
    [patientContext, encounterContext, assistMutation],
  );

  const handleQuickAction = useCallback(
    (action: QuickAction) => {
      handleSubmit(action.query);
    },
    [handleSubmit],
  );

  // Pulse animation for FAB
  const startPulse = useCallback(() => {
    Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.1, duration: 150, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start();
  }, [pulseAnim]);

  const handleOpen = useCallback(() => {
    startPulse();
    setVisible(true);
  }, [startPulse]);

  const handleClose = useCallback(() => {
    setVisible(false);
    setResponse(null);
    setError(null);
    setQuery('');
  }, []);

  // ── Render ──

  return (
    <>
      {/* FAB */}
      <Animated.View style={[styles.fabContainer, { transform: [{ scale: pulseAnim }] }]}>
        <Pressable
          style={[
            styles.fab,
            { backgroundColor: isAvailable ? theme.colors.primary : theme.colors.mutedText },
          ]}
          onPress={handleOpen}
          accessibilityLabel="Ask TibaBot"
          accessibilityRole="button"
        >
          <Ionicons name="sparkles" size={24} color="#FFFFFF" />
        </Pressable>
        {!isAvailable && statusQuery.isFetched ? (
          <View style={[styles.statusDot, { backgroundColor: theme.colors.danger }]} />
        ) : null}
      </Animated.View>

      {/* Bottom sheet modal */}
      <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
        <Pressable style={styles.overlay} onPress={handleClose} />
        <KeyboardAvoidingView
          style={styles.sheetContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.sheet, { backgroundColor: theme.colors.background }]}>
            {/* Handle bar */}
            <View style={styles.handleBarRow}>
              <View style={[styles.handleBar, { backgroundColor: theme.colors.border }]} />
            </View>

            {/* Header */}
            <View style={styles.sheetHeader}>
              <Ionicons name="sparkles" size={20} color={theme.colors.primary} />
              <Text style={[styles.sheetTitle, { color: theme.colors.text }]}>{sheetTitle}</Text>
              <Pressable onPress={handleClose} hitSlop={12}>
                <Ionicons name="close" size={22} color={theme.colors.mutedText} />
              </Pressable>
            </View>

            {!isAvailable ? (
              <View style={[styles.statusBanner, { backgroundColor: `${theme.colors.warning}18` }]}>
                <Ionicons name="cloud-offline-outline" size={16} color={theme.colors.warning} />
                <Text style={[styles.statusText, { color: theme.colors.warning }]}>
                  TibaBot is currently unavailable. Queries may fail.
                </Text>
              </View>
            ) : null}

            <ScrollView
              ref={scrollRef}
              style={styles.scrollArea}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
            >
              {/* Quick actions */}
              {!response && !assistMutation.isPending ? (
                <View style={styles.quickActionsGrid}>
                  {quickActions.map((action) => (
                    <Pressable
                      key={action.id}
                      style={[styles.quickAction, { backgroundColor: theme.colors.elevated, borderColor: theme.colors.border }]}
                      onPress={() => handleQuickAction(action)}
                    >
                      <Ionicons name={action.icon} size={18} color={theme.colors.primary} />
                      <Text style={[styles.quickActionLabel, { color: theme.colors.text }]}>{action.label}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              {/* Loading */}
              {assistMutation.isPending ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                  <Text style={[styles.loadingText, { color: theme.colors.mutedText }]}>TibaBot is thinking...</Text>
                </View>
              ) : null}

              {/* Error */}
              {error ? (
                <View style={[styles.errorCard, { backgroundColor: `${theme.colors.danger}12` }]}>
                  <Ionicons name="alert-circle" size={18} color={theme.colors.danger} />
                  <Text style={[styles.errorText, { color: theme.colors.danger }]}>{error}</Text>
                </View>
              ) : null}

              {/* Response */}
              {response ? (
                <View style={styles.responseContainer}>
                  <View style={[styles.queryEcho, { backgroundColor: `${theme.colors.primary}12` }]}>
                    <Text style={[styles.queryLabel, { color: theme.colors.primary }]}>You asked:</Text>
                    <Text style={[styles.queryText, { color: theme.colors.text }]} numberOfLines={3}>
                      {query}
                    </Text>
                  </View>

                  <View style={[styles.responseCard, { backgroundColor: theme.colors.elevated, borderColor: theme.colors.border }]}>
                    <View style={styles.responseHeader}>
                      <Ionicons name="sparkles" size={14} color={theme.colors.primary} />
                      <Text style={[styles.responseLabel, { color: theme.colors.primary }]}>TibaBot</Text>
                    </View>
                    <Text style={[styles.responseText, { color: theme.colors.text }]}>{response}</Text>
                  </View>

                  {/* Feedback */}
                  <View style={styles.feedbackRow}>
                    <Text style={[styles.feedbackLabel, { color: theme.colors.mutedText }]}>Was this helpful?</Text>
                    <View style={styles.feedbackButtons}>
                      <Pressable
                        style={[styles.feedbackBtn, { borderColor: theme.colors.border }]}
                        onPress={() => feedbackMutation.mutate('up')}
                        disabled={feedbackMutation.isPending || feedbackMutation.isSuccess}
                      >
                        <Ionicons
                          name={feedbackMutation.isSuccess && feedbackMutation.variables === 'up' ? 'thumbs-up' : 'thumbs-up-outline'}
                          size={16}
                          color={feedbackMutation.isSuccess && feedbackMutation.variables === 'up' ? theme.colors.primary : theme.colors.mutedText}
                        />
                      </Pressable>
                      <Pressable
                        style={[styles.feedbackBtn, { borderColor: theme.colors.border }]}
                        onPress={() => feedbackMutation.mutate('down')}
                        disabled={feedbackMutation.isPending || feedbackMutation.isSuccess}
                      >
                        <Ionicons
                          name={feedbackMutation.isSuccess && feedbackMutation.variables === 'down' ? 'thumbs-down' : 'thumbs-down-outline'}
                          size={16}
                          color={feedbackMutation.isSuccess && feedbackMutation.variables === 'down' ? theme.colors.danger : theme.colors.mutedText}
                        />
                      </Pressable>
                    </View>
                  </View>
                </View>
              ) : null}
            </ScrollView>

            {/* Input bar */}
            <View style={[styles.inputBar, { borderTopColor: theme.colors.border }]}>
              <TextInput
                style={[styles.textInput, { color: theme.colors.text, backgroundColor: theme.colors.elevated, borderColor: theme.colors.border }]}
                placeholder={inputPlaceholder}
                placeholderTextColor={theme.colors.mutedText}
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={() => handleSubmit(query)}
                returnKeyType="send"
                editable={!assistMutation.isPending}
              />
              <Pressable
                style={[styles.sendBtn, { backgroundColor: query.trim() ? theme.colors.primary : theme.colors.border }]}
                onPress={() => handleSubmit(query)}
                disabled={!query.trim() || assistMutation.isPending}
              >
                <Ionicons name="send" size={18} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

// ──────────────────── Styles ────────────────────

const SCREEN_HEIGHT = Dimensions.get('window').height;

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    // FAB
    fabContainer: {
      bottom: 24,
      position: 'absolute',
      right: 20,
      zIndex: 50,
    },
    fab: {
      alignItems: 'center',
      borderRadius: 28,
      elevation: 6,
      height: 56,
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.25,
      shadowRadius: 5,
      width: 56,
    },
    statusDot: {
      borderColor: theme.colors.background,
      borderRadius: 6,
      borderWidth: 2,
      height: 12,
      position: 'absolute',
      right: 0,
      top: 0,
      width: 12,
    },

    // Overlay
    overlay: {
      backgroundColor: 'rgba(0,0,0,0.35)',
      flex: 1,
    },

    // Sheet
    sheetContainer: {
      bottom: 0,
      left: 0,
      maxHeight: SCREEN_HEIGHT * 0.85,
      position: 'absolute',
      right: 0,
    },
    sheet: {
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: SCREEN_HEIGHT * 0.85,
      paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    },
    handleBarRow: {
      alignItems: 'center',
      paddingVertical: 10,
    },
    handleBar: {
      borderRadius: 3,
      height: 4,
      width: 36,
    },

    // Header
    sheetHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 8,
      paddingBottom: 12,
      paddingHorizontal: 16,
    },
    sheetTitle: {
      flex: 1,
      fontSize: 17,
      fontWeight: '700',
    },

    // Status
    statusBanner: {
      alignItems: 'center',
      borderRadius: theme.radius.sm,
      flexDirection: 'row',
      gap: 8,
      marginHorizontal: 16,
      marginBottom: 8,
      padding: 10,
    },
    statusText: {
      flex: 1,
      fontSize: 12,
      fontWeight: '600',
    },

    // Scroll
    scrollArea: {
      maxHeight: SCREEN_HEIGHT * 0.5,
    },
    scrollContent: {
      gap: 12,
      paddingHorizontal: 16,
      paddingBottom: 12,
    },

    // Quick actions
    quickActionsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    quickAction: {
      alignItems: 'center',
      borderRadius: theme.radius.md,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 8,
      minWidth: '47%',
      flex: 1,
      padding: 12,
    },
    quickActionLabel: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
    },

    // Loading
    loadingContainer: {
      alignItems: 'center',
      gap: 10,
      paddingVertical: 24,
    },
    loadingText: {
      fontSize: 13,
    },

    // Error
    errorCard: {
      alignItems: 'center',
      borderRadius: theme.radius.md,
      flexDirection: 'row',
      gap: 8,
      padding: 12,
    },
    errorText: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
    },

    // Response
    responseContainer: {
      gap: 10,
    },
    queryEcho: {
      borderRadius: theme.radius.sm,
      gap: 4,
      padding: 10,
    },
    queryLabel: {
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    queryText: {
      fontSize: 13,
    },
    responseCard: {
      borderRadius: theme.radius.md,
      borderWidth: 1,
      gap: 8,
      padding: 14,
    },
    responseHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 6,
    },
    responseLabel: {
      fontSize: 12,
      fontWeight: '700',
    },
    responseText: {
      fontSize: 14,
      lineHeight: 21,
    },

    // Feedback
    feedbackRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 4,
    },
    feedbackLabel: {
      fontSize: 12,
    },
    feedbackButtons: {
      flexDirection: 'row',
      gap: 8,
    },
    feedbackBtn: {
      alignItems: 'center',
      borderRadius: theme.radius.sm,
      borderWidth: 1,
      height: 32,
      justifyContent: 'center',
      width: 32,
    },

    // Input bar
    inputBar: {
      borderTopWidth: 1,
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 16,
      paddingTop: 10,
    },
    textInput: {
      borderRadius: theme.radius.md,
      borderWidth: 1,
      flex: 1,
      fontSize: 14,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    sendBtn: {
      alignItems: 'center',
      borderRadius: theme.radius.md,
      height: 42,
      justifyContent: 'center',
      width: 42,
    },
  });
}
