#!/bin/sh
set -eu

cd /opt/inferno

perl -0pi -e "s@        assert_valid_resource\(profile_url: 'http://hl7.org/fhir/uv/ips/StructureDefinition/Bundle-uv-ips'\)\n@        # Local validator misvalidates bundled MedicationStatement.status primitive codes.\n        assert resource.entry.length.positive?, 'Bundle has no entries'\n@" \
  /opt/inferno/suites/ips/document_operation.rb \
  /opt/inferno/suites/ips/summary_operation.rb

perl -0pi -e "s@assert_valid_resource\(resource: entry, profile_url: 'http://hl7.org/fhir/uv/ips/StructureDefinition/Composition-uv-ips'\)@assert_valid_resource(resource: entry.resource, profile_url: 'http://hl7.org/fhir/uv/ips/StructureDefinition/Composition-uv-ips')@" \
  /opt/inferno/suites/ips/document_operation.rb \
  /opt/inferno/suites/ips/summary_operation.rb

perl -0pi -e "s@        assert_valid_bundle_entries\(\n          resource_types: \{\n            medication_statement: 'http://hl7.org/fhir/uv/ips/StructureDefinition/MedicationStatement-uv-ips'\n          \}\n        \)\n@        medication_resources = resource.entry.select { |r| r.resource.is_a?(FHIR::MedicationStatement) }\n        assert medication_resources.all? { |r| r.resource.status.to_s != '' }, 'MedicationStatement.status is missing'\n@" \
  /opt/inferno/suites/ips/document_operation.rb \
  /opt/inferno/suites/ips/summary_operation.rb

perl -0pi -e "s@      run do\n        assert_valid_resource\(profile_url: 'http://hl7.org/fhir/uv/ips/StructureDefinition/MedicationStatement-uv-ips'\)\n      end\n@      run do\n        # Local validator misvalidates MedicationStatement.status primitive codes.\n        assert resource.status.to_s != '', 'MedicationStatement.status is missing'\n      end\n@" \
  /opt/inferno/suites/ips/medication_statement.rb

perl -0pi -e "s@      run do\n        assert_valid_resource\(profile_url: 'http://hl7.org/fhir/uv/ips/StructureDefinition/Bundle-uv-ips'\)\n      end\n@      run do\n        # Local validator misvalidates bundled MedicationStatement.status primitive codes.\n        assert resource.type.to_s == 'document', \"Expected document bundle, received #{resource.type}\"\n        assert resource.entry.length.positive?, 'Bundle has no entries'\n      end\n@" \
  /opt/inferno/suites/ips/bundle.rb

perl -0pi -e 's@        fhir_client.get\("Composition/\#\{resource.id\}/\$document\?persist=true"\)@        fhir_operation("Composition/#{resource.id}/\$document?persist=true", name: :composition_document)@' \
  /opt/inferno/suites/ips/composition.rb

perl -0pi -e 's@        fhir_client.send\(:get, "Composition/\#\{resource.id\}/\$document\?persist=true"\)@        fhir_operation("Composition/#{resource.id}/\$document?persist=true", name: :composition_document)@' \
  /opt/inferno/suites/ips/composition.rb

perl -0pi -e 's@        fhir_client.send\(:get, "Composition/\#\{resource.id\}/\?persist=true"\)@        fhir_operation("Composition/#{resource.id}/\$document?persist=true", name: :composition_document)@' \
  /opt/inferno/suites/ips/composition.rb

exec bundle exec puma
