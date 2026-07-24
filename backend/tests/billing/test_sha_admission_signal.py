import pytest


@pytest.mark.django_db
class TestSHAAdmissionBillingSignal:
    def test_async_trigger_helper_still_queues_task(self, mocker):
        from hmis.apps.billing.signals import trigger_sha_eligibility_verification

        delay_mock = mocker.patch("hmis.apps.billing.tasks.verify_patient_sha_eligibility.delay")

        trigger_sha_eligibility_verification(368, 2)

        delay_mock.assert_called_once_with(368, 2)

    def test_sha_admission_runs_sync_eligibility_and_publishes_result_payload(
        self,
        sample_admission,
        mocker,
    ):
        from hmis.apps.billing.signals import handle_admission_billing
        from hmis.apps.inpatient.models import Admission

        sample_admission.payer_type = "SHA"
        sample_admission.save(update_fields=["payer_type"])

        order: list[str] = []

        def _verify(patient_id, facility_id):
            order.append("verify")
            return {
                "status": "refreshed",
                "eligible": True,
                "member_status": "active",
                "reason": "ok",
            }

        mocker.patch("hmis.apps.billing.tasks.verify_patient_sha_eligibility", side_effect=_verify)

        def _handle_admission_created(_admission):
            order.append("agent")

        mocker.patch(
            "hmis.apps.billing.agent.BillingAgentService.handle_admission_created",
            side_effect=_handle_admission_created,
        )
        mock_publish = mocker.patch("hmis.apps.billing.signals.publish_event")

        handle_admission_billing(sender=Admission, instance=sample_admission, created=True)

        assert order == ["verify", "agent"]
        payload = mock_publish.call_args.kwargs["payload"]
        assert payload["patient_id"] == sample_admission.patient_id
        assert payload["payer_type"] == "SHA"
        assert payload["sha_eligibility_sync"] == {
            "status": "refreshed",
            "eligible": True,
            "member_status": "active",
            "reason": "ok",
        }

    def test_sync_eligibility_failure_falls_back_to_async_trigger(
        self,
        sample_admission,
        mocker,
    ):
        from hmis.apps.billing.signals import handle_admission_billing
        from hmis.apps.inpatient.models import Admission

        sample_admission.payer_type = "SHA"
        sample_admission.save(update_fields=["payer_type"])

        mocker.patch(
            "hmis.apps.billing.tasks.verify_patient_sha_eligibility",
            side_effect=RuntimeError("upstream down"),
        )
        fallback_trigger = mocker.patch(
            "hmis.apps.billing.signals.trigger_sha_eligibility_verification"
        )
        agent_call = mocker.patch(
            "hmis.apps.billing.agent.BillingAgentService.handle_admission_created"
        )
        mock_publish = mocker.patch("hmis.apps.billing.signals.publish_event")

        handle_admission_billing(sender=Admission, instance=sample_admission, created=True)

        fallback_trigger.assert_called_once_with(
            sample_admission.patient_id,
            sample_admission.facility_id,
        )
        agent_call.assert_called_once_with(sample_admission)
        payload = mock_publish.call_args.kwargs["payload"]
        assert payload["sha_eligibility_sync"] is None
