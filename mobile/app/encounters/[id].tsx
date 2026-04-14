import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { AppButton, DataRow, EmptyState, HeroCard, LoadingState, Pill, ScreenContainer, SectionCard } from '@/components/app-ui';
import { CDSAlertBanner } from '@/components/cds-alert-banner';
import { SyncIndicator } from '@/components/sync-indicator';
import { TibaBotAssist } from '@/components/tibabot-assist';
import type { AppTheme } from '@/constants/theme';
import { toApiError } from '@/lib/api/client';
import { clinicVisitsApi } from '@/lib/api/clinic-visits';
import { encountersApi } from '@/lib/api/encounters';
import { useLocalEncounter } from '@/lib/hooks/use-local-encounters';
import { laboratoryApi } from '@/lib/api/laboratory';
import { pharmacyApi } from '@/lib/api/pharmacy';
import { triageApi } from '@/lib/api/triage';
import { hasEditDraft } from '@/lib/encounter-draft-storage';
import { canCancel, canFinalize, canStartProgress, getEncounterPillTone, getEncounterStatusLabel, getFinalizeGuidance, mapEncounterTransitionError } from '@/lib/encounters';
import { queryClient } from '@/lib/query/client';
import { useAppTheme } from '@/lib/theme/theme-context';
import { formatDate, formatDateTime, formatGender } from '@/lib/utils/format';

function getLabStatusTone(status: string): 'primary' | 'warning' | 'danger' | 'neutral' {
  if (status === 'COMPLETED') {
    return 'primary';
  }
  if (status === 'CANCELLED' || status === 'REJECTED') {
    return 'danger';
  }
  if (status === 'IN_PROGRESS' || status === 'SPECIMEN_COLLECTED') {
    return 'warning';
  }
  return 'neutral';
}

function getPrescriptionTone(status: string): 'primary' | 'warning' | 'danger' | 'neutral' {
  if (status === 'DISPENSED') {
    return 'primary';
  }
  if (status === 'PARTIAL') {
    return 'warning';
  }
  if (status === 'CANCELLED' || status === 'EXPIRED') {
    return 'danger';
  }
  return 'neutral';
}

export default function EncounterDetailScreen() {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const params = useLocalSearchParams<{ id: string }>();
  const encounterId = Number(params.id);
  const [hasLocalDraft, setHasLocalDraft] = useState(false);
  const encounterQuery = useLocalEncounter(encounterId);
  const encounter = encounterQuery.encounter;
  const canLoadRemoteDependents = Boolean(encounter && encounterId > 0 && encounter.sync_state === 'synced');

  const diagnosesQuery = useQuery({
    queryKey: ['encounter-diagnoses', encounterId],
    queryFn: () => encountersApi.getDiagnoses(encounterId),
    enabled: canLoadRemoteDependents,
  });

  const treatmentPlanQuery = useQuery({
    queryKey: ['encounter-treatment-plan', encounterId],
    queryFn: () => encountersApi.getTreatmentPlan(encounterId),
    enabled: canLoadRemoteDependents,
  });

  const triageQuery = useQuery({
    queryKey: ['encounter-triage', encounterId],
    queryFn: () => triageApi.getByEncounter(encounterId),
    enabled: canLoadRemoteDependents,
  });

  const labOrdersQuery = useQuery({
    queryKey: ['encounter-lab-orders', encounterId],
    queryFn: () => laboratoryApi.listEncounterOrders(encounterId),
    enabled: canLoadRemoteDependents,
  });

  const prescriptionsQuery = useQuery({
    queryKey: ['encounter-prescriptions', encounterId],
    queryFn: () => pharmacyApi.listPrescriptions({ encounter: encounterId, page: 1, page_size: 50 }),
    enabled: canLoadRemoteDependents,
  });

  const clinicVisitId = encounter?.clinic_visit_id ?? null;
  const clinicVisitQuery = useQuery({
    queryKey: ['clinic-visit', clinicVisitId],
    queryFn: () => clinicVisitsApi.get(clinicVisitId as number),
    enabled: Boolean(clinicVisitId) && canLoadRemoteDependents,
  });

  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function refreshDraftState() {
        const exists = await hasEditDraft(encounterId);
        if (active) {
          setHasLocalDraft(exists);
        }
      }

      if (Number.isFinite(encounterId)) {
        void refreshDraftState();
      }

      return () => {
        active = false;
      };
    }, [encounterId])
  );

  const invalidateEncounterContext = useCallback(async (patientId?: number | null) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['encounter', encounterId] }),
      queryClient.invalidateQueries({ queryKey: ['encounters'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] }),
      queryClient.invalidateQueries({ queryKey: ['encounter-triage', encounterId] }),
      patientId ? queryClient.invalidateQueries({ queryKey: ['patient-encounters', patientId] }) : Promise.resolve(),
    ]);
  }, [encounterId]);

  const startProgressMutation = useMutation({
    mutationFn: () => encountersApi.startProgress(encounterId),
    onSuccess: async (updatedEncounter) => {
      await invalidateEncounterContext(updatedEncounter.patient);
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: () => encountersApi.finalize(encounterId),
    onSuccess: async (updatedEncounter) => {
      await invalidateEncounterContext(updatedEncounter.patient);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => encountersApi.cancel(encounterId, 'Cancelled from mobile encounter workflow.'),
    onSuccess: async (updatedEncounter) => {
      await invalidateEncounterContext(updatedEncounter.patient);
    },
  });

  const startClinicConsultationMutation = useMutation({
    mutationFn: (clinicVisitId: number) => clinicVisitsApi.startConsultation(clinicVisitId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['clinic-visit', clinicVisitId] }),
        invalidateEncounterContext(encounter?.patient),
      ]);
    },
  });

  if (encounterQuery.isLoading) {
    return (
      <ScreenContainer scroll={false}>
        <LoadingState message="Loading encounter details..." fullScreen />
      </ScreenContainer>
    );
  }

  if (!encounter) {
    return (
      <ScreenContainer>
        <EmptyState title="Encounter not found" description="This encounter is not available in the local cache yet." />
      </ScreenContainer>
    );
  }

  const triageAssessment = triageQuery.data;
  const finalizeGuidance = getFinalizeGuidance({
    hasDiagnosis: (diagnosesQuery.data?.length ?? 0) > 0,
    hasTreatmentPlan: Boolean(treatmentPlanQuery.data),
    disposition: encounter.disposition,
    dispositionNotes: encounter.disposition_notes,
  });

  const tibaBotPatientContext = encounter.patient_age != null && encounter.patient_gender
    ? {
        patient_age: encounter.patient_age,
        patient_sex: encounter.patient_gender,
        allergies: encounter.allergies ? [encounter.allergies] : undefined,
        current_medications: encounter.current_medications ? [encounter.current_medications] : undefined,
      }
    : undefined;

  const tibaBotEncounterContext = {
    chief_complaint: encounter.chief_complaint || undefined,
    vitals: {
      spo2: encounter.spo2 != null ? Number(encounter.spo2) : undefined,
      pulse: encounter.pulse ?? undefined,
      temperature: encounter.temperature != null ? Number(encounter.temperature) : undefined,
      rr: encounter.respiratory_rate ?? undefined,
    },
  };

  function confirmStartProgress() {
    Alert.alert('Start encounter progress', 'Move this encounter into active consultation?', [
      { text: 'Not now', style: 'cancel' },
      {
        text: 'Start progress',
        onPress: async () => {
          try {
            await startProgressMutation.mutateAsync();
          } catch (error) {
            const apiError = toApiError(error);
            Alert.alert('Unable to start progress', mapEncounterTransitionError(apiError.message));
          }
        },
      },
    ]);
  }

  function confirmFinalize() {
    if (!finalizeGuidance.ready) {
      Alert.alert(finalizeGuidance.title, `${finalizeGuidance.message} Open Edit Encounter to resolve this before retrying.`, [
        { text: 'Stay here', style: 'cancel' },
        { text: 'Open edit', onPress: () => router.push(`/encounters/${encounterId}/edit` as never) },
      ]);
      return;
    }

    Alert.alert('Finalize encounter', 'This will close the encounter if the backend validation passes.', [
      { text: 'Keep open', style: 'cancel' },
      {
        text: 'Finalize visit',
        style: 'destructive',
        onPress: async () => {
          try {
            await finalizeMutation.mutateAsync();
          } catch (error) {
            const apiError = toApiError(error);
            Alert.alert('Unable to finalize encounter', mapEncounterTransitionError(apiError.message));
          }
        },
      },
    ]);
  }

  function confirmCancel() {
    Alert.alert('Cancel encounter', 'This will cancel the encounter and stop further mobile workflow actions.', [
      { text: 'Keep encounter', style: 'cancel' },
      {
        text: 'Cancel encounter',
        style: 'destructive',
        onPress: async () => {
          try {
            await cancelMutation.mutateAsync();
          } catch (error) {
            const apiError = toApiError(error);
            Alert.alert('Unable to cancel encounter', mapEncounterTransitionError(apiError.message));
          }
        },
      },
    ]);
  }

  return (
    <ScreenContainer>
      <SyncIndicator />

      <HeroCard
        eyebrow="Encounter"
        title={encounter.patient_name || encounter.patient_mrn || `Encounter #${encounter.id}`}
        description={`${encounter.encounter_type_display || encounter.encounter_type} · ${encounter.patient_mrn || 'MRN pending'} · ${formatDate(encounter.encounter_date)}`}
      >
        <View style={styles.heroPills}>
          {encounter.sync_state !== 'synced' ? <Pill label="Pending sync" tone={encounter.sync_state === 'conflict' ? 'danger' : 'warning'} /> : null}
          <Pill label={getEncounterStatusLabel(encounter.status)} tone={getEncounterPillTone(encounter)} />
        </View>
      </HeroCard>

      {canLoadRemoteDependents ? <CDSAlertBanner encounterId={encounterId} /> : null}

      {hasLocalDraft ? (
        <SectionCard title="Unsaved changes" subtitle="This encounter has a locally stored edit draft waiting to be applied or saved.">
          <AppButton label="Resume draft" onPress={() => router.push(`/encounters/${encounter.id}/edit` as never)} />
        </SectionCard>
      ) : null}

      {!canLoadRemoteDependents ? (
        <SectionCard title="Awaiting sync" subtitle="This encounter is stored locally and will gain full downstream workflow actions after the server confirms it.">
          <DataRow label="Sync state" value={encounter.sync_state.replace(/_/g, ' ')} />
          <DataRow label="Chief complaint" value={encounter.chief_complaint} />
          <DataRow label="Created at" value={formatDateTime(encounter.created_at)} />
        </SectionCard>
      ) : null}

      <SectionCard title="Finalize readiness" subtitle="Mobile close-out guidance based on the backend encounter validation rules.">
        <Pill label={finalizeGuidance.ready ? 'Ready to finalize' : 'Needs more documentation'} tone={finalizeGuidance.ready ? 'primary' : 'warning'} />
        <Text style={styles.bodyText}>{finalizeGuidance.message}</Text>
        {!finalizeGuidance.ready ? <AppButton label="Update disposition or notes" variant="secondary" onPress={() => router.push(`/encounters/${encounter.id}/edit` as never)} disabled={!canLoadRemoteDependents} /> : null}
      </SectionCard>

      <SectionCard title="Encounter actions" subtitle="Continue this visit by updating documentation, diagnoses, treatment, and status workflow.">
        <AppButton label="Edit encounter" onPress={() => router.push(`/encounters/${encounter.id}/edit` as never)} disabled={!canLoadRemoteDependents} />
        {!triageAssessment ? <AppButton label="Record triage" variant="secondary" onPress={() => router.push(`/encounters/${encounter.id}/triage` as never)} disabled={!canLoadRemoteDependents} /> : null}
        <AppButton label="Order labs" variant="secondary" onPress={() => router.push(`/laboratory/new?encounterId=${encounter.id}&patientId=${encounter.patient}` as never)} disabled={!canLoadRemoteDependents} />
        <AppButton label="Create prescription" variant="secondary" onPress={() => router.push(`/pharmacy/new?encounterId=${encounter.id}&patientId=${encounter.patient}` as never)} disabled={!canLoadRemoteDependents} />
        {canStartProgress(encounter.status) ? <AppButton label={startProgressMutation.isPending ? 'Starting progress...' : 'Start progress'} variant="secondary" onPress={confirmStartProgress} disabled={startProgressMutation.isPending || !canLoadRemoteDependents} /> : null}
        {canFinalize(encounter.status) ? <AppButton label={finalizeMutation.isPending ? 'Finalizing...' : 'Finalize visit'} onPress={confirmFinalize} disabled={finalizeMutation.isPending || !canLoadRemoteDependents} /> : null}
        {canCancel(encounter.status) ? <AppButton label={cancelMutation.isPending ? 'Cancelling...' : 'Cancel encounter'} variant="danger" onPress={confirmCancel} disabled={cancelMutation.isPending || !canLoadRemoteDependents} /> : null}
      </SectionCard>

      <SectionCard title="Summary">
        <DataRow label="Chief complaint" value={encounter.chief_complaint} />
        <DataRow label="Patient" value={encounter.patient_name} />
        <DataRow label="Gender" value={encounter.patient_gender ? formatGender(encounter.patient_gender) : null} />
        <DataRow label="Encounter date" value={formatDate(encounter.encounter_date)} />
        <DataRow label="Destination clinic" value={encounter.clinic_name} />
        <DataRow label="Created at" value={formatDateTime(encounter.created_at)} />
        <DataRow label="Created by" value={encounter.created_by_name} />
        <DataRow label="Assigned clinician" value={encounter.assigned_clinician_name || encounter.assigned_clinician_username} />
      </SectionCard>

      {encounter.clinic_visit_id ? (
        <SectionCard title="Clinic queue" subtitle="Destination clinic details for encounters created through direct clinic check-in.">
          {clinicVisitQuery.isLoading ? (
            <LoadingState message="Loading clinic queue details..." />
          ) : clinicVisitQuery.data ? (
            <View style={styles.planStack}>
              <View style={styles.rowBetween}>
                <View style={styles.flexOne}>
                  <Text style={styles.cardTitle}>{clinicVisitQuery.data.clinic_name || encounter.clinic_name || 'Clinic queue visit'}</Text>
                  <Text style={styles.cardMeta}>{encounter.clinic_type || clinicVisitQuery.data.visit_type_display || 'Clinic routing'} · Queue #{clinicVisitQuery.data.queue_number}</Text>
                </View>
                <Pill label={clinicVisitQuery.data.status_display || clinicVisitQuery.data.status} tone={clinicVisitQuery.data.status === 'IN_CONSULTATION' ? 'primary' : clinicVisitQuery.data.status === 'COMPLETED' ? 'neutral' : 'warning'} />
              </View>
              <DataRow label="Queue position" value={clinicVisitQuery.data.queue_number != null ? String(clinicVisitQuery.data.queue_number) : null} />
              <DataRow label="Estimated wait" value={clinicVisitQuery.data.wait_time_minutes != null ? `${clinicVisitQuery.data.wait_time_minutes} minutes` : null} />
              <DataRow label="Registered at" value={formatDateTime(clinicVisitQuery.data.registered_at)} />
              <DataRow label="Called at" value={formatDateTime(clinicVisitQuery.data.called_at)} />
              <DataRow label="Consultation started" value={formatDateTime(clinicVisitQuery.data.consultation_started_at)} />
              <DataRow label="Assigned clinician" value={clinicVisitQuery.data.assigned_clinician_name} />
              <DataRow label="Queue notes" value={clinicVisitQuery.data.notes} />
              {['REGISTERED', 'WAITING', 'CALLED'].includes(clinicVisitQuery.data.status) ? (
                <AppButton
                  label={startClinicConsultationMutation.isPending ? 'Starting consultation...' : 'Start consultation'}
                  onPress={async () => {
                    try {
                      await startClinicConsultationMutation.mutateAsync(clinicVisitQuery.data.id);
                    } catch (error) {
                      const apiError = toApiError(error);
                      Alert.alert('Unable to start clinic consultation', apiError.message);
                    }
                  }}
                  disabled={startClinicConsultationMutation.isPending}
                />
              ) : null}
            </View>
          ) : (
            <EmptyState title="Clinic queue details unavailable" description="The encounter is linked to a clinic visit, but the clinic visit record could not be loaded." />
          )}
        </SectionCard>
      ) : null}

      <SectionCard title="Vitals" subtitle="Critical values and calculated vitals come straight from the encounter serializer.">
        <View style={styles.vitalsGrid}>
          <View style={styles.vitalsTile}>
            <Text style={styles.vitalsLabel}>Temperature</Text>
            <Text style={styles.vitalsValue}>{encounter.temperature != null ? `${encounter.temperature} °C` : 'Not recorded'}</Text>
          </View>
          <View style={styles.vitalsTile}>
            <Text style={styles.vitalsLabel}>Pulse</Text>
            <Text style={styles.vitalsValue}>{encounter.pulse != null ? `${encounter.pulse} bpm` : 'Not recorded'}</Text>
          </View>
          <View style={styles.vitalsTile}>
            <Text style={styles.vitalsLabel}>Blood pressure</Text>
            <Text style={styles.vitalsValue}>{encounter.blood_pressure || 'Not recorded'}</Text>
          </View>
          <View style={styles.vitalsTile}>
            <Text style={styles.vitalsLabel}>Respiratory rate</Text>
            <Text style={styles.vitalsValue}>{encounter.respiratory_rate != null ? `${encounter.respiratory_rate}/min` : 'Not recorded'}</Text>
          </View>
          <View style={styles.vitalsTile}>
            <Text style={styles.vitalsLabel}>SpO2</Text>
            <Text style={styles.vitalsValue}>{encounter.spo2 != null ? `${encounter.spo2}%` : 'Not recorded'}</Text>
          </View>
          <View style={styles.vitalsTile}>
            <Text style={styles.vitalsLabel}>BMI</Text>
            <Text style={styles.vitalsValue}>{encounter.bmi != null ? `${encounter.bmi}` : 'Not available'}</Text>
          </View>
        </View>
        {encounter.alerts ? <Text style={styles.alertText}>{encounter.alerts}</Text> : null}
      </SectionCard>

      <SectionCard title="Medical history">
        <DataRow label="Allergies" value={encounter.allergies} />
        <DataRow label="Chronic conditions" value={encounter.chronic_conditions} />
        <DataRow label="Current medications" value={encounter.current_medications} />
        <DataRow label="Past surgeries" value={encounter.past_surgeries} />
        <DataRow label="Family history" value={encounter.family_history} />
        <DataRow label="Social history" value={encounter.social_history} />
      </SectionCard>

      <SectionCard title="Clinical notes">
        <DataRow label="History of present illness" value={encounter.history_of_present_illness} />
        <DataRow label="Physical examination" value={encounter.physical_examination} />
        <DataRow label="Assessment" value={encounter.assessment} />
        <DataRow label="Notes" value={encounter.notes} />
      </SectionCard>

      <SectionCard title="Diagnoses" subtitle="Primary, secondary, and differential diagnoses recorded for this encounter.">
        {(diagnosesQuery.data ?? []).length === 0 ? (
          <EmptyState title="No diagnoses" description="No diagnoses have been recorded for this encounter yet." />
        ) : (
          (diagnosesQuery.data ?? []).map((diagnosis) => (
            <View key={diagnosis.id} style={styles.cardBlock}>
              <View style={styles.rowBetween}>
                <View style={styles.flexOne}>
                  <Text style={styles.cardTitle}>{diagnosis.icd10_description || diagnosis.free_text_diagnosis || 'Diagnosis'}</Text>
                  <Text style={styles.cardMeta}>
                    {diagnosis.icd10_code_display || diagnosis.icd11_code || 'Free text diagnosis'} · {diagnosis.certainty}
                  </Text>
                </View>
                <View style={styles.badgeStack}>
                  {diagnosis.icd10_code_display ? <Pill label={diagnosis.icd10_code_display} tone="warning" /> : null}
                  <Pill label={diagnosis.diagnosis_type} tone={diagnosis.diagnosis_type === 'PRIMARY' ? 'primary' : 'neutral'} />
                </View>
              </View>
              {diagnosis.notes ? <Text style={styles.bodyText}>{diagnosis.notes}</Text> : null}
            </View>
          ))
        )}
      </SectionCard>

      <SectionCard title="Triage" subtitle="Kenya Emergency Triage Assessment summary for this encounter.">
        {!triageAssessment ? (
          <EmptyState title="No triage assessment" description="Record triage to capture KETA acuity and routing from mobile." />
        ) : (
          <View style={styles.planStack}>
            <View style={styles.rowBetween}>
              <View style={styles.flexOne}>
                <Text style={styles.cardTitle}>{triageAssessment.chief_complaint}</Text>
                <Text style={styles.cardMeta}>{triageAssessment.chief_complaint_category} · {triageAssessment.assigned_area || triageAssessment.assigned_clinic_name || 'Routing pending'}</Text>
              </View>
              <Pill label={triageAssessment.triage_category} tone={triageAssessment.triage_category === 'RED' || triageAssessment.triage_category === 'ORANGE' ? 'danger' : triageAssessment.triage_category === 'YELLOW' ? 'warning' : 'primary'} />
            </View>
            <DataRow label="Wait time" value={triageAssessment.wait_time_minutes != null ? `${triageAssessment.wait_time_minutes} minutes` : null} />
            <DataRow label="Arrival" value={formatDateTime(triageAssessment.arrival_time)} />
            <DataRow label="Started triage" value={formatDateTime(triageAssessment.triage_start_time)} />
            <DataRow label="Completed triage" value={formatDateTime(triageAssessment.triage_end_time || encounter.triage_completed_at)} />
            {triageAssessment.alerts.map((alert) => (
              <Text key={alert.id} style={styles.alertText}>{alert.message}</Text>
            ))}
          </View>
        )}
      </SectionCard>

      <SectionCard title="Lab orders" subtitle="Requests linked to this encounter can be reviewed or extended from the bedside.">
        {labOrdersQuery.isLoading ? (
          <LoadingState message="Loading encounter lab orders..." />
        ) : (labOrdersQuery.data ?? []).length === 0 ? (
          <EmptyState title="No lab orders" description="Create the first lab request for this encounter to start tracking specimen and result workflow." />
        ) : (
          (labOrdersQuery.data ?? []).map((order) => (
            <View key={order.order_number} style={styles.cardBlock}>
              <View style={styles.rowBetween}>
                <View style={styles.flexOne}>
                  <Text style={styles.cardTitle}>{order.order_number}</Text>
                  <Text style={styles.cardMeta}>{order.priority.replace(/_/g, ' ')} · {order.items.length} test{order.items.length === 1 ? '' : 's'}</Text>
                </View>
                <Pill label={order.status.replace(/_/g, ' ')} tone={getLabStatusTone(order.status)} />
              </View>
              {order.clinical_notes ? <Text style={styles.bodyText}>{order.clinical_notes}</Text> : null}
              <Text style={styles.cardMeta}>Ordered {formatDateTime(order.ordered_at)}</Text>
              <AppButton label="Open lab order" variant="ghost" onPress={() => router.push(`/laboratory/${encodeURIComponent(order.order_number)}` as never)} />
            </View>
          ))
        )}
      </SectionCard>

      <SectionCard title="Prescriptions" subtitle="Medication orders from this encounter feed directly into the dispensing queue.">
        {prescriptionsQuery.isLoading ? (
          <LoadingState message="Loading encounter prescriptions..." />
        ) : (prescriptionsQuery.data?.results ?? []).length === 0 ? (
          <EmptyState title="No prescriptions" description="Create a prescription from this encounter to send medications to pharmacy." />
        ) : (
          (prescriptionsQuery.data?.results ?? []).map((prescription) => (
            <View key={prescription.id} style={styles.cardBlock}>
              <View style={styles.rowBetween}>
                <View style={styles.flexOne}>
                  <Text style={styles.cardTitle}>{prescription.prescription_number}</Text>
                  <Text style={styles.cardMeta}>{prescription.items.length} item{prescription.items.length === 1 ? '' : 's'} · valid until {formatDate(prescription.valid_until)}</Text>
                </View>
                <Pill label={prescription.status.replace(/_/g, ' ')} tone={getPrescriptionTone(prescription.status)} />
              </View>
              {prescription.clinical_notes ? <Text style={styles.bodyText}>{prescription.clinical_notes}</Text> : null}
              <Text style={styles.cardMeta}>Prescribed {formatDateTime(prescription.prescribed_at || prescription.created_at)}</Text>
              <AppButton label="Open prescription" variant="ghost" onPress={() => router.push(`/pharmacy/${prescription.id}` as never)} />
            </View>
          ))
        )}
      </SectionCard>

      <SectionCard title="Treatment plan" subtitle="Plan text, follow-up, and medication summary for this visit.">
        {!treatmentPlanQuery.data ? (
          <EmptyState title="No treatment plan" description="This encounter does not have a treatment plan yet." />
        ) : (
          <View style={styles.planStack}>
            <DataRow label="Clinical plan" value={treatmentPlanQuery.data.clinical_notes} />
            <DataRow label="Follow-up instructions" value={treatmentPlanQuery.data.follow_up_instructions} />
            <DataRow label="Follow-up date" value={formatDate(treatmentPlanQuery.data.follow_up_date)} />
            <DataRow label="Diet recommendations" value={treatmentPlanQuery.data.diet_recommendations} />
            <DataRow label="Activity restrictions" value={treatmentPlanQuery.data.activity_restrictions} />
            <DataRow label="Referral specialty" value={treatmentPlanQuery.data.referral_specialty} />
            <DataRow label="Referral notes" value={treatmentPlanQuery.data.referral_notes} />
            {(treatmentPlanQuery.data.medications ?? []).length > 0 ? (
              <View style={styles.planStack}>
                <Text style={styles.sectionLabel}>Medications</Text>
                {treatmentPlanQuery.data.medications.map((medication) => (
                  <View key={medication.id} style={styles.cardBlock}>
                    <View style={styles.rowBetween}>
                      <Text style={styles.cardTitle}>{medication.name}</Text>
                      <Pill label={medication.route} tone="neutral" />
                    </View>
                    <Text style={styles.cardMeta}>{medication.dosage} · {medication.frequency} · {medication.duration}</Text>
                    {medication.instructions ? <Text style={styles.bodyText}>{medication.instructions}</Text> : null}
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        )}
      </SectionCard>

      <SectionCard title="Workflow">
        <DataRow label="Triage requirement" value={encounter.triage_requirement} />
        <DataRow label="Triage status" value={encounter.triage_status} />
        <DataRow label="Triage category" value={encounter.triage_category || triageAssessment?.triage_category || null} />
        <DataRow label="Disposition" value={encounter.disposition} />
        <DataRow label="Disposition notes" value={encounter.disposition_notes} />
        <DataRow label="Consultation status" value={encounter.consultation_status} />
        <DataRow label="Claimed at" value={formatDateTime(encounter.claimed_at)} />
        <DataRow label="Finalized at" value={formatDateTime(encounter.finalized_at)} />
        <DataRow label="Cancellation reason" value={encounter.cancellation_reason} />
      </SectionCard>

      {canLoadRemoteDependents ? (
        <TibaBotAssist
          patientContext={tibaBotPatientContext}
          encounterContext={tibaBotEncounterContext}
        />
      ) : null}
    </ScreenContainer>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
  heroPills: {
    gap: 8,
  },
  vitalsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  vitalsTile: {
    backgroundColor: theme.colors.elevated,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    gap: 6,
    minWidth: '47%',
    padding: 12,
  },
  vitalsLabel: {
    color: theme.colors.mutedText,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  vitalsValue: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  alertText: {
    color: theme.colors.danger,
    fontSize: 13,
    fontWeight: '700',
  },
  badgeStack: {
    alignItems: 'flex-end',
    gap: 6,
  },
  rowBetween: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  flexOne: {
    flex: 1,
    marginRight: 12,
  },
  cardBlock: {
    backgroundColor: theme.colors.elevated,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    gap: 6,
    padding: 12,
  },
  cardTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  cardMeta: {
    color: theme.colors.mutedText,
    fontSize: 12,
  },
  bodyText: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  planStack: {
    gap: 12,
  },
  sectionLabel: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  });
}
