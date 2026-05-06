"""
Pre-built analyzer driver templates for common Kenya lab analyzers.

These templates provide default configuration for protocol settings,
field mappings, and known quirks for each analyzer model.
"""

# Common analyzer templates for Kenya L2-L5 facilities
DRIVER_TEMPLATES = [
    {
        "name": "Sysmex XN Series (ASTM)",
        "manufacturer": "Sysmex",
        "model_pattern": "XN-*",
        "category": "HEMATOLOGY",
        "description": (
            "Sysmex XN-1000/XN-2000/XN-3000 hematology analyzers. "
            "Uses ASTM E1394 with Sysmex-specific extensions for CBC, "
            "differential, and reticulocyte parameters."
        ),
        "protocol": "ASTM",
        "default_port": 9100,
        "default_encoding": "ascii",
        "default_config": {
            "baud_rate": 9600,
            "timeout_ms": 30000,
            "frame_size": 240,
            "field_delimiter": "|",
            "component_delimiter": "^",
            # TODO: [AFTER PILOT] Validate ENQ/ACK handshake timing
            # Sysmex requires specific inter-frame delays
            "inter_frame_delay_ms": 200,
        },
        "default_field_mapping": {
            "sample_id_field": "O.2",
            "test_code_field": "R.2",
            "result_value_field": "R.3",
            "result_unit_field": "R.4",
            "result_flags_field": "R.6",
        },
        "notes": (
            "Sysmex XN series sends results as multiple R records per CBC panel. "
            "WBC, RBC, HGB, HCT, PLT each in separate R records with sequence numbers. "
            "Host query mode requires firmware version 01-03 or later."
        ),
    },
    {
        "name": "Sysmex XP Series (ASTM)",
        "manufacturer": "Sysmex",
        "model_pattern": "XP-*",
        "category": "HEMATOLOGY",
        "description": (
            "Sysmex XP-100/XP-300 compact hematology analyzers. "
            "Common in L2-L3 facilities. Simplified ASTM interface."
        ),
        "protocol": "ASTM",
        "default_port": 9100,
        "default_encoding": "ascii",
        "default_config": {
            "baud_rate": 9600,
            "timeout_ms": 30000,
            "frame_size": 240,
            "field_delimiter": "|",
            "component_delimiter": "^",
        },
        "default_field_mapping": {
            "sample_id_field": "O.2",
            "test_code_field": "R.2",
            "result_value_field": "R.3",
            "result_unit_field": "R.4",
        },
        "notes": (
            "XP series does NOT support host query (unidirectional only). "
            "Results are pushed automatically after analysis completes."
        ),
    },
    {
        "name": "Roche cobas c Series (ASTM)",
        "manufacturer": "Roche",
        "model_pattern": "cobas c*",
        "category": "CHEMISTRY",
        "description": (
            "Roche cobas c111/c311/c501/c502 clinical chemistry analyzers. "
            "Uses ASTM/LIS2-A2 protocol. Common in L3-L5 facilities."
        ),
        "protocol": "ASTM",
        "default_port": 9100,
        "default_encoding": "ascii",
        "default_config": {
            "baud_rate": 9600,
            "timeout_ms": 45000,
            "frame_size": 240,
            "field_delimiter": "|",
            "component_delimiter": "^",
            # Roche uses extended frame numbering
            "extended_frames": True,
        },
        "default_field_mapping": {
            "sample_id_field": "O.2",
            "test_code_field": "R.2",
            "result_value_field": "R.3",
            "result_unit_field": "R.4",
            "result_flags_field": "R.6",
        },
        "notes": (
            "Roche cobas c series supports full bidirectional ASTM. "
            "Host query returns all pending samples in queue. "
            "Test codes use Roche channel numbers (e.g., c501 channel 1-4). "
            "Map channel numbers to test catalog codes in field_mapping."
        ),
    },
    {
        "name": "Roche cobas e Series (ASTM)",
        "manufacturer": "Roche",
        "model_pattern": "cobas e*",
        "category": "IMMUNOASSAY",
        "description": (
            "Roche cobas e411/e601/e801 immunoassay analyzers. "
            "Electrochemiluminescence (ECL) platform for hormones, "
            "tumor markers, cardiac markers, infectious disease."
        ),
        "protocol": "ASTM",
        "default_port": 9100,
        "default_encoding": "ascii",
        "default_config": {
            "baud_rate": 9600,
            "timeout_ms": 60000,
            "frame_size": 240,
            "field_delimiter": "|",
            "component_delimiter": "^",
        },
        "default_field_mapping": {
            "sample_id_field": "O.2",
            "test_code_field": "R.2",
            "result_value_field": "R.3",
            "result_unit_field": "R.4",
        },
        "notes": (
            "cobas e series has longer analysis times (18-27 min). "
            "Results may arrive significantly after sample loading. "
            "Supports reruns and dilution flags in result records."
        ),
    },
    {
        "name": "Abbott Architect (ASTM)",
        "manufacturer": "Abbott",
        "model_pattern": "Architect*",
        "category": "CHEMISTRY",
        "description": (
            "Abbott Architect c4000/c8000/i1000/i2000 series. "
            "Clinical chemistry and immunoassay platforms."
        ),
        "protocol": "ASTM",
        "default_port": 9200,
        "default_encoding": "ascii",
        "default_config": {
            "baud_rate": 9600,
            "timeout_ms": 30000,
            "frame_size": 240,
            "field_delimiter": "|",
            "component_delimiter": "^",
            # Abbott uses slightly different field positions
            "abbott_mode": True,
        },
        "default_field_mapping": {
            "sample_id_field": "O.3",  # Abbott uses field 3 for sample ID
            "test_code_field": "R.2",
            "result_value_field": "R.3",
            "result_unit_field": "R.4",
        },
        "notes": (
            "Abbott Architect uses OBR field 3 (not 2) for specimen ID. "
            "Ensure field_mapping reflects this. "
            "Supports batch mode: multiple samples in one session."
        ),
    },
    {
        "name": "Beckman Coulter AU (HL7)",
        "manufacturer": "Beckman Coulter",
        "model_pattern": "AU*",
        "category": "CHEMISTRY",
        "description": (
            "Beckman Coulter AU480/AU680/AU5800 chemistry analyzers. "
            "Uses HL7 v2.x over MLLP for bidirectional communication."
        ),
        "protocol": "HL7",
        "default_port": 5000,
        "default_encoding": "utf-8",
        "default_config": {
            "sending_application": "VITORA",
            "sending_facility": "VITORA_LAB",
            "receiving_application": "BECKMAN_AU",
            "receiving_facility": "",
            "version": "2.5",
            "ack_mode": "AL",
        },
        "default_field_mapping": {
            "sample_id_field": "OBR.3",
            "test_code_field": "OBX.3",
            "result_value_field": "OBX.5",
            "result_unit_field": "OBX.6",
            "result_flags_field": "OBX.8",
        },
        "notes": (
            "Beckman AU series uses standard HL7 v2.5 over MLLP. "
            "Bidirectional with host query support (QRY message type). "
            "Results include instrument flags (H, L, HH, LL)."
        ),
    },
    {
        "name": "Mindray BC Series (HL7)",
        "manufacturer": "Mindray",
        "model_pattern": "BC-*",
        "category": "HEMATOLOGY",
        "description": (
            "Mindray BC-5000/BC-6000/BC-6200 hematology analyzers. "
            "Popular in Kenya L2-L4 facilities. HL7 v2.x interface."
        ),
        "protocol": "HL7",
        "default_port": 6000,
        "default_encoding": "utf-8",
        "default_config": {
            "sending_application": "VITORA",
            "sending_facility": "VITORA_LAB",
            "receiving_application": "MINDRAY_BC",
            "receiving_facility": "",
            "version": "2.3.1",
            "ack_mode": "AL",
            # TODO: [AFTER PILOT] Validate Mindray-specific HL7 extensions
            # Some Mindray models use custom Z-segments for scatter plots
        },
        "default_field_mapping": {
            "sample_id_field": "OBR.3",
            "test_code_field": "OBX.3",
            "result_value_field": "OBX.5",
            "result_unit_field": "OBX.6",
        },
        "notes": (
            "Mindray BC series uses HL7 v2.3.1. "
            "Some models send scatter plot data in custom Z-segments. "
            "Host query supported in BC-6000+ only."
        ),
    },
    {
        "name": "GeneXpert (HL7/File)",
        "manufacturer": "Cepheid",
        "model_pattern": "GeneXpert*",
        "category": "MOLECULAR",
        "description": (
            "Cepheid GeneXpert systems for TB (Xpert MTB/RIF), "
            "COVID-19, HIV viral load. HL7 interface or file export."
        ),
        "protocol": "HL7",
        "default_port": 5500,
        "default_encoding": "utf-8",
        "default_config": {
            "sending_application": "VITORA",
            "sending_facility": "VITORA_LAB",
            "receiving_application": "GENEXPERT",
            "receiving_facility": "",
            "version": "2.5",
            "ack_mode": "AL",
            # GeneXpert also supports file-based export
            # TODO: [AFTER PILOT] Add file watcher mode for GeneXpert
            # Some facilities prefer file export over network connection
            "file_export_path": "",
            "file_watch_enabled": False,
        },
        "default_field_mapping": {
            "sample_id_field": "OBR.3",
            "test_code_field": "OBX.3",
            "result_value_field": "OBX.5",
        },
        "notes": (
            "GeneXpert results are qualitative (Detected/Not Detected/Invalid/Error). "
            "For MTB/RIF: includes rifampicin resistance result. "
            "CT values included in OBX segments for quantitative interpretation. "
            "File export mode writes HL7 files to a configured directory."
        ),
    },
    {
        "name": "BD BACTEC (HL7)",
        "manufacturer": "BD (Becton Dickinson)",
        "model_pattern": "BACTEC*",
        "category": "MICROBIOLOGY",
        "description": (
            "BD BACTEC FX/FX40 blood culture systems. Sends positive/negative results via HL7."
        ),
        "protocol": "HL7",
        "default_port": 5600,
        "default_encoding": "utf-8",
        "default_config": {
            "sending_application": "VITORA",
            "sending_facility": "VITORA_LAB",
            "receiving_application": "BACTEC",
            "receiving_facility": "",
            "version": "2.5",
            "ack_mode": "AL",
        },
        "default_field_mapping": {
            "sample_id_field": "OBR.3",
            "test_code_field": "OBX.3",
            "result_value_field": "OBX.5",
        },
        "notes": (
            "BD BACTEC sends results when bottle flags positive or at final negative. "
            "Results are: POSITIVE, NEGATIVE, or NO GROWTH (after incubation period). "
            "Positive results trigger immediate notification (critical value). "
            "Integration with microbiology module for culture workflow."
        ),
    },
]
