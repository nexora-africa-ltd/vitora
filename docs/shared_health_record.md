SHR Service APIs
SHR Consent
Endpoint
https://ilm-dev.dha.go.ke/uat-middleware/api/v1


API information
Endpoints for the SHR consent lifecycle: requesting patient consent, verifying it with an OTP, polling its status, resending the OTP, and refreshing or closing the visit it opened.

Request patient consent for an SHR visit
POST
https://ilm-dev.dha.go.ke/uat-middleware/api/v1
/shr/consents
Initiates a consent request against the DHA Consent Management Platform. On success DHA dispatches a one-time password to the patient and returns a consent_id used by the verify, status and resend-otp calls.

Three kinds of request share this endpoint. A standard request asks the patient directly. An emergency request, for a patient who cannot consent at the point of care, is approved immediately and returns the visit id and consent token in place of a password. A dependant request names a representative - a parent for a minor, or a proxy for an incapacitated adult - and routes the consent to them instead.

Check the List visits with an open consent endpoint first: a patient who already has an open visit at the facility cannot start another.

Related documentation: Introduction to the Shared Health Record

Request patient consent for an SHR visit ›Request Body
Payload that initiates a Shared Health Record consent request against the DHA Consent Management Platform. The same payload covers three cases. A **standard** request carries only the four required fields plus `practitioner_id`. An **emergency** request adds `emergency` and `incapacity_reason` for a patient who cannot consent at the point of care. A **dependant** request adds `representative_cr_id` and `representative_relationship`, which route the consent - and its one-time password - to the representative instead of the patient.
cr_idstring · required
Client Registry (CR) identifier of the patient whose records the consent covers. For a dependant request this stays the dependant's identifier; the representative is named separately.

Example: CR99551207471367-7
facility_idstring · required
Facility Registry (FR) code of the facility requesting consent.

Example: FID-47-115307-8
requested_bystring · required
Name or role of the person requesting consent. Recorded on the consent audit trail.

Example: Registration Clerk
visit_typestring · enum · required
Type of visit the consent is being requested for. OP for outpatient, IP for inpatient.

Enum values:
OP
IP
Example: IP
emergencyinteger · enum
Set to 1 for an emergency consent, where the patient is incapacitated and consent cannot be collected at the point of care. incapacity_reason is required alongside it. An emergency consent is approved immediately, so the response carries the visit id and consent token rather than an OTP record.

Enum values:
0
1
Example: 1
incapacity_reasonstring
Why the patient cannot consent for themselves. Required for an emergency consent, and for a dependant request where patient_capable is 0 and the patient is an adult.

Example: Emergency patient
patient_capableinteger · enum
Set to 0 when the patient cannot consent for themselves, for example an incapacitated adult. Defaults to 1. When 0, representative_cr_id is required, and incapacity_reason is required as well unless the patient is a minor.

Enum values:
0
1
Example: 1
practitioner_idstring
Practitioner Unique Identifier (PUID) of the clinician requesting consent. Send this on every request - the Consent Management Platform expects it, even though the HIE does not reject a request without it.

Example: PUID-0000443-3
representative_cr_idstring
Client Registry identifier of the principal consenting on the patient's behalf. Provide it whenever cr_id refers to a dependant - a minor, or a patient with patient_capable set to 0. The consent request and its OTP are then routed to the representative, who becomes the record's principal.

Example: CR08244412193-5
representative_relationshipstring · enum
How the representative relates to the patient. Required whenever representative_cr_id is provided.

Enum values:
Healthcare Proxy
Sibling
Principal
Other
Example: Healthcare Proxy
start_datestring · date
Date the visit starts, as YYYY-MM-DD. Defaults to the date the consent is created.

Example: 2026-07-18
Request patient consent for an SHR visit ›Responses
200
400
401
403
500
Consent request created

Result of creating a consent request. On a standard request DHA dispatches a one-time password to the patient and returns the consent id used by the verify, status and resend-otp calls. An **emergency** request is approved on the spot instead: no password is sent, and the response carries `visit_id` and `consent_token` directly, so records can be read immediately.
consent_idstring
Identifier of the consent request. Supply it on the verify, status and resend-otp calls.

Example: VCR-20260624-13698E26
consent_statusstring
Current state of the consent request as reported by DHA, for example Pending while the patient has not yet entered the OTP, or Approved for an emergency consent.

Example: Pending
consent_tokenstring
Per-visit token used to read patient records. Returned only for an emergency consent, which is approved without a password.

Example: eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIyNjYzOW
emergencyboolean
Whether this consent was granted through the emergency route.

Example: true
messagestring
Human readable outcome message from DHA.

Example: Consent request created successfully
otp_recordstring
OTP record reference. Send it back with the OTP when verifying the consent. Absent on an emergency consent, which needs no password.

Example: d67p9lhxxx
statusstring
Outcome status reported by DHA.

Example: success
visit_idstring
Identifier of the visit the consent opened. Returned only for an emergency consent; on a standard consent the visit id arrives with the verification.

Example: 47f7e19f-89f8-49a2-9b05-efa749793ce7
visit_typestring · enum
Type of visit the consent was requested for.

Enum values:
OP
IP
Example: IP
POST/shr/consents

cURL
curl --request POST \
  --url https://ilm-dev.dha.go.ke/uat-middleware/api/v1/shr/consents \
  --header 'Content-Type: application/json' \
  --data '
{
  "cr_id": "CR99551207471367-7",
  "emergency": 0,
  "facility_id": "FID-47-115307-8",
  "incapacity_reason": "Emergency patient",
  "patient_capable": 0,
  "practitioner_id": "PUID-0000443-3",
  "representative_cr_id": "CR08244412193-5",
  "representative_relationship": "Healthcare Proxy",
  "requested_by": "Registration Clerk",
  "start_date": "2024-08-25",
  "visit_type": "OP"
}
'
shell
Example Request Body
{
  "cr_id": "CR99551207471367-7",
  "emergency": 0,
  "facility_id": "FID-47-115307-8",
  "incapacity_reason": "Emergency patient",
  "patient_capable": 0,
  "practitioner_id": "PUID-0000443-3",
  "representative_cr_id": "CR08244412193-5",
  "representative_relationship": "Healthcare Proxy",
  "requested_by": "Registration Clerk",
  "start_date": "2024-08-25",
  "visit_type": "OP"
}
json

Example Responses

200
{
  "consent_id": "VCR-20260624-13698E26",
  "consent_status": "Pending",
  "consent_token": "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIyNjYzOW",
  "emergency": true,
  "message": "Consent request created successfully",
  "otp_record": "d67p9lhxxx",
  "status": "success",
  "visit_id": "47f7e19f-89f8-49a2-9b05-efa749793ce7",
  "visit_type": "OP"
}
json
application/json
Verify patient consent with an OTP
POST
https://ilm-dev.dha.go.ke/uat-middleware/api/v1
/shr/consents/{consent_id}/verify
Records the patient's consent decision. Verifying with the one-time password the patient received opens a visit and returns the per-visit consent token used to read patient records.

The same endpoint records a refusal: send consent_decision as Reject with a rejection_reason, and no token is issued.

It also completes an OTP-gated visit closure. Send the otp_record returned by the Close an SHR visit endpoint together with the password the performer received; the response carries the date the visit closed rather than a consent token.

Related documentation: Introduction to the Shared Health Record

Verify patient consent with an OTP ›path Parameters
consent_idstring · required
Consent id returned by the consent request.

Example: VCR-20260624-13698E26
Verify patient consent with an OTP ›Request Body
Payload that records the patient's consent decision. For the one-time password channel, send `otp_record` and `otp`. Add `consent_decision` to record a refusal - a consent that cannot be refused is not consent - together with `rejection_reason`. The same endpoint also completes an OTP-gated visit closure: send the `otp_record` returned by Close Visit with the password the performer received, and the visit closes without a new consent token being issued. No single field is mandatory on its own, because the combination depends on the channel. Sending an empty body is accepted by the HIE and rejected upstream.
agentstring
Identifier of the agent or channel performing the verification. Resolved from the request headers when omitted.

Example: DHABPxxxxx0
consent_decisionstring · enum
The patient's decision. Accepts Approve or Reject, or their numeric forms 1 and 0. Treated as an approval when omitted.

Enum values:
Approve
Reject
1
0
Example: 1
geo_distance_kmnumber · float
Distance in kilometres between where consent was captured and the facility. Captured on the Afyayangu channel.

Example: 10
geo_latnumber · float
Latitude of the location where consent was captured. Captured on the Afyayangu channel.

Example: -1.2921
geo_lonnumber · float
Longitude of the location where consent was captured. Captured on the Afyayangu channel.

Example: 36.8219
otpstring
One-time password the patient received from DHA. Required on the OTP channel.

Example: 14384
otp_recordstring
OTP record reference. Use the value returned by the consent request to verify consent, or the value returned by Close Visit to complete an OTP-gated closure. Required on the OTP channel.

Example: d67p9lhxxx
rejection_reasonstring
Why the patient refused consent. Required when consent_decision records a refusal.

Example: Patient denied consent
Verify patient consent with an OTP ›Responses
200
400
401
403
500
Consent verified

Result of recording a consent decision. On an approval through the one-time password channel, the response carries the visit id and the per-visit consent token used to read patient records. On a refusal, or an approval captured off the password channel, it reports the consent id and its resulting status instead of a token. When the verification completed an OTP-gated visit closure, it carries the date the visit closed.
consent_idstring
Identifier of the consent that was decided. Returned on refusals and on approvals captured off the one-time password channel.

Example: VCR-20260624-13698E26
consent_statusstring
State the consent settled into, for example Approved or Rejected. Returned alongside consent_id.

Example: Approved
consent_tokenstring
Per-visit token used to read patient records. Send it in the X-Consent-Token header. Issued on an approval through the one-time password channel; a closure verification does not issue one.

Example: eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJmOTI3OWM3OC1lNTVlLTQ1MDAtYTBlNS1hOGRlMTQxMzM3YjciLCJzdWIiOiJDUjA4MjQ0NDEyMTkzMjktNSJ9
end_datestring · date
Date the visit closed. Returned only when this verification completed an OTP-gated visit closure.

Example: 2026-07-15
messagestring
Human readable outcome message from DHA.

Example: Consent has been approved. Please use the token provided to access patient records.
statusstring
Outcome status reported by DHA.

Example: success
visit_idstring
Identifier of the visit the approved consent opened.

Example: 8e7559bf-a509-468b-9be4-74150b978e9e
POST/shr/consents/{consent_id}/verify

cURL
curl --request POST \
  --url https://ilm-dev.dha.go.ke/uat-middleware/api/v1/shr/consents/:consent_id/verify \
  --header 'Content-Type: application/json' \
  --data '
{
  "agent": "DHABPxxxxx0",
  "consent_decision": "Approve",
  "geo_distance_km": 10,
  "geo_lat": -1.2921,
  "geo_lon": 36.8219,
  "otp": "14384",
  "otp_record": "d67p9lhxxx",
  "rejection_reason": "Patient denied consent"
}
'
shell
Example Request Body
{
  "agent": "DHABPxxxxx0",
  "consent_decision": "Approve",
  "geo_distance_km": 10,
  "geo_lat": -1.2921,
  "geo_lon": 36.8219,
  "otp": "14384",
  "otp_record": "d67p9lhxxx",
  "rejection_reason": "Patient denied consent"
}
json

Example Responses

200
{
  "consent_id": "VCR-20260624-13698E26",
  "consent_status": "Approved",
  "consent_token": "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJmOTI3OWM3OC1lNTVlLTQ1MDAtYTBlNS1hOGRlMTQxMzM3YjciLCJzdWIiOiJDUjA4MjQ0NDEyMTkzMjktNSJ9",
  "end_date": "2024-08-25",
  "message": "Consent has been approved. Please use the token provided to access patient records.",
  "status": "success",
  "visit_id": "8e7559bf-a509-468b-9be4-74150b978e9e"
}
json
application/json
Poll the status of a consent request
GET
https://ilm-dev.dha.go.ke/uat-middleware/api/v1
/shr/consents/{consent_id}/status
Returns the current status of a consent request identified by its consent id. Poll this endpoint while the patient completes the OTP step. Once consent is approved the response also carries the visit_id.

Related documentation: Introduction to the Shared Health Record

Poll the status of a consent request ›path Parameters
consent_idstring · required
Consent id returned by the consent request.

Example: VCR-20260624-13698E26
Poll the status of a consent request ›Responses
200
400
401
403
500
Consent status

Current status of a consent request. Once the patient has approved, the response also carries the visit id opened for the consent.
consent_idstring
Identifier of the consent request being polled.

Example: VCR-20260624-13698E26
consent_statusstring
Current state of the consent request as reported by DHA, for example Pending or Approved.

Example: Approved
messagestring
Human readable outcome message from DHA.

Example: Consent status retrieved successfully
statusstring
Outcome status reported by DHA.

Example: success
visit_idstring
Identifier of the visit opened against the approved consent. Use it to refresh consent or to close the visit.

Example: f5c2fd92-1847-407f-97b7-a9d277699c22
GET/shr/consents/{consent_id}/status

cURL
curl --request GET \
  --url https://ilm-dev.dha.go.ke/uat-middleware/api/v1/shr/consents/:consent_id/status
shell

Example Responses

200
{
  "consent_id": "VCR-20260624-13698E26",
  "consent_status": "Approved",
  "message": "Consent status retrieved successfully",
  "status": "success",
  "visit_id": "f5c2fd92-1847-407f-97b7-a9d277699c22"
}
json
application/json
Resend the consent OTP
POST
https://ilm-dev.dha.go.ke/uat-middleware/api/v1
/shr/consents/{consent_id}/resend-otp
Asks DHA to resend the OTP for a pending consent request. The response carries a fresh otp_record - verify the consent with that value, not the one from the original consent request.

Related documentation: Introduction to the Shared Health Record

Resend the consent OTP ›path Parameters
consent_idstring · required
Consent id returned by the consent request.

Example: VCR-20260624-13698E26
Resend the consent OTP ›Responses
200
400
401
403
500
OTP resent

Result of asking DHA to resend the consent OTP. It echoes the consent the OTP belongs to and carries a fresh OTP record reference.
consent_idstring
Identifier of the consent request the OTP was resent for.

Example: VCR-20260624-13698E26
consent_statusstring
Current state of the consent request as reported by DHA.

Example: Pending
messagestring
Human readable outcome message from DHA.

Example: OTP resent successfully
otp_recordstring
OTP record reference for the newly issued OTP. Use this value, not the earlier one, when verifying the consent.

Example: d67p9lhxxx
statusstring
Outcome status reported by DHA.

Example: success
visit_typestring · enum
Type of visit the consent was requested for.

Enum values:
OP
IP
Example: IP
POST/shr/consents/{consent_id}/resend-otp

cURL
curl --request POST \
  --url https://ilm-dev.dha.go.ke/uat-middleware/api/v1/shr/consents/:consent_id/resend-otp
shell

Example Responses

200
{
  "consent_id": "VCR-20260624-13698E26",
  "consent_status": "Pending",
  "message": "OTP resent successfully",
  "otp_record": "d67p9lhxxx",
  "status": "success",
  "visit_type": "OP"
}
json
application/json
Refresh patient consent for an open visit
POST
https://ilm-dev.dha.go.ke/uat-middleware/api/v1
/shr/visits/{visit_id}/refresh
Refreshes patient consent for an open visit and returns a fresh consent token. Use it when the token issued at verification has expired but the visit is still open.

Related documentation: Introduction to the Shared Health Record

Refresh patient consent for an open visit ›path Parameters
visit_idstring · required
Visit id of the open visit.

Example: f5c2fd92-1847-407f-97b7-a9d277699c22
Refresh patient consent for an open visit ›Responses
200
400
401
403
500
Consent refreshed

Result of refreshing patient consent for an open visit. It carries a fresh consent token for reading patient records.
consent_tokenstring
Refreshed per-visit consent token. Replace the token you were using and send this one in the X-Consent-Token header.

Example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9
messagestring
Human readable outcome message from DHA.

Example: Patient consent refreshed successfully
statusstring
Outcome status reported by DHA.

Example: success
POST/shr/visits/{visit_id}/refresh

cURL
curl --request POST \
  --url https://ilm-dev.dha.go.ke/uat-middleware/api/v1/shr/visits/:visit_id/refresh
shell

Example Responses

200
{
  "consent_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
  "message": "Patient consent refreshed successfully",
  "status": "success"
}
json
application/json
Close an SHR visit
POST
https://ilm-dev.dha.go.ke/uat-middleware/api/v1
/shr/visits/{visit_id}/close
Closes the visit identified by its visit id. Close the visit once the encounter is complete - the consent token can no longer be refreshed afterwards.

Closure is normally gated by a one-time password sent to whoever gave consent: the response carries an otp_record, and the visit closes only once that password is verified through the Verify patient consent with an OTP endpoint. Where the deployment has OTP-gated closure switched off, or consent was given by a healthcare proxy, the visit closes immediately and the response carries the end date instead.

To close a visit for a patient who cannot consent to the closure - unconscious or deceased - send the optional body with patient_incapable set to 1. The visit then closes immediately, with no password sent or required.

Related documentation: Introduction to the Shared Health Record

Close an SHR visit ›path Parameters
visit_idstring · required
Visit id to close.

Example: f5c2fd92-1847-407f-97b7-a9d277699c22
Close an SHR visit ›Request Body
optional
Optional body for closing a visit. Send it only when the patient cannot consent to the closure themselves; omit it entirely for a normal closure. The visit is identified by the path, so no identifier is carried here.
incapacity_reasonstring
Why the patient cannot consent to the closure. Required when patient_incapable is 1.

Example: Unconscious
patient_incapableinteger · enum
Set to 1 when the patient cannot consent to closing the visit - for example unconscious or deceased. The visit then closes immediately, with no one-time password sent or required.

Enum values:
0
1
Example: 1
Close an SHR visit ›Responses
200
400
401
403
500
Visit closed, or a closure one-time password dispatched

Result of closing an SHR visit. An immediate closure carries the end date and the visit is already closed. An OTP-gated closure carries `otp_record` instead: the visit stays open until that password is verified through Verify Consent OTP. Once closed, the visit's consent token can no longer be refreshed.
consent_idstring
Identifier of the consent request the closed visit belonged to.

Example: VCR-20260624-13698E26
end_datestring · date
Date the visit was closed. Returned on an immediate closure.

Example: 2026-07-15
messagestring
Human readable outcome message from DHA.

Example: Consent closure initiated.
otp_recordstring
OTP record reference for a closure awaiting verification. Send it, with the password the performer received, to Verify Consent OTP to complete the closure.

Example: 9fh38gd21k
statusstring
Outcome status reported by DHA.

Example: success
visit_idstring
Identifier of the visit that was closed.

Example: f5c2fd92-1847-407f-97b7-a9d277699c22
POST/shr/visits/{visit_id}/close

cURL
curl --request POST \
  --url https://ilm-dev.dha.go.ke/uat-middleware/api/v1/shr/visits/:visit_id/close \
  --header 'Content-Type: application/json' \
  --data '
{
  "incapacity_reason": "Unconscious",
  "patient_incapable": 0
}
'
shell
Example Request Body
{
  "incapacity_reason": "Unconscious",
  "patient_incapable": 0
}
json

Example Responses

200
{
  "consent_id": "VCR-20260624-13698E26",
  "end_date": "2024-08-25",
  "message": "Consent closure initiated.",
  "otp_record": "9fh38gd21k",
  "status": "success",
  "visit_id": "f5c2fd92-1847-407f-97b7-a9d277699c22"
}
json
application/json
List visits with an open consent
GET
https://ilm-dev.dha.go.ke/uat-middleware/api/v1
/shr/open-visits
Lists the visits at a facility that still hold an open patient consent. Call it before starting a fresh consent request: if the patient already has an open visit at your facility you can keep using it - refresh its consent token with POST /shr/visits/{visit_id}/refresh - instead of putting the patient through another OTP.

The response carries the visit ids only. Anything else you need about the visit comes from the consent status or refresh calls.

Related documentation: Introduction to the Shared Health Record

List visits with an open consent ›query Parameters
patient_idstring · required
Client Registry (CR) identifier of the patient whose open visits are being listed. Sent upstream as the patient's Client Registry id.

Example: CR99551207471367-7
facility_idstring · required
Facility Registry (FR) code of the facility the visits belong to.

Example: FID-47-115307-8
List visits with an open consent ›Responses
200
400
401
403
500
Open consent visits

The visits that still hold an open patient consent for a patient at a facility.
messagestring
Human readable outcome message from DHA.

Example: Open consent visits retrieved successfully
statusstring
Outcome status reported by DHA.

Example: success
visitsobject[]
Visits with an open consent. An empty array means the patient has no open visit at this facility, so a fresh consent request is needed.


GET/shr/open-visits

cURL

curl --request GET \
  --url 'https://ilm-dev.dha.go.ke/uat-middleware/api/v1/shr/open-visits?patient_id=%3Cstring%3E&facility_id=%3Cstring%3E'
shell

Example Responses

200
{
  "message": "Open consent visits retrieved successfully",
  "status": "success",
  "visits": [
    {
      "visit_id": "f5c2fd92-1847-407f-97b7-a9d277699c22"
    }
  ]
}
json
application/json
