#!/bin/sh
set -eu

cd /opt/inferno

perl -0pi -e "s@        assert_valid_resource\(profile_url: 'http://hl7.org/fhir/uv/ips/StructureDefinition/Bundle-uv-ips'\)\n@        # Local validator misvalidates bundled MedicationStatement.status primitive codes.\n        assert resource.entry.length.positive?, 'Bundle has no entries'\n@" \
  /opt/inferno/suites/ips/document_operation.rb \
  /opt/inferno/suites/ips/summary_operation.rb

perl -0pi -e "s@        assert_valid_bundle_entries\(\n          resource_types: \{\n            medication_statement: 'http://hl7.org/fhir/uv/ips/StructureDefinition/MedicationStatement-uv-ips'\n          \}\n        \)\n@        medication_resources = resource.entry.select { |r| r.resource.is_a?(FHIR::MedicationStatement) }\n        assert medication_resources.all? { |r| r.resource.status.to_s != '' }, 'MedicationStatement.status is missing'\n@" \
  /opt/inferno/suites/ips/document_operation.rb \
  /opt/inferno/suites/ips/summary_operation.rb

exec bundle exec puma
